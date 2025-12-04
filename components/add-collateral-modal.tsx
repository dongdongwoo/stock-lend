'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore, type Position } from '@/lib/store';
import { mapCollateralTokens } from '@/lib/contracts/config';
import { TransactionModal, type TxStep } from './transaction-modal';
import { Plus, TrendingUp } from 'lucide-react';
import {
  useOraclePricesWagmi,
  usePositionDataWagmi,
  useCollateralRiskParamsWagmi,
  useAllowedCollateralTokensWagmi,
} from '@/lib/hooks';
import { parseUnits } from 'viem';
import { addCollateral } from '@/lib/contracts/lending';
import { mintTokenByMaster, approveTokenForLending } from '@/lib/contracts/tokens';
import { getCustodyWalletAddress, ensureEthBalance } from '@/lib/wallet/custody';

interface AddCollateralModalProps {
  open: boolean;
  onClose: () => void;
  position: (Position & { onChainId?: bigint }) | null;
}

export function AddCollateralModal({ open, onClose, position }: AddCollateralModalProps) {
  const { user, updatePosition, updateUserStocks, saveCurrentUser } = useStore();

  // 온체인 데이터 조회
  const { prices: onChainPrices } = useOraclePricesWagmi();
  const { riskParams } = useCollateralRiskParamsWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();
  const { accruedInterest: onChainAccruedInterest, healthFactor: onChainHealthFactor } =
    usePositionDataWagmi(position?.onChainId ? position.onChainId : null);

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  const [amount, setAmount] = useState('');
  const [showTx, setShowTx] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [txHash, setTxHash] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  if (!position || !user) return null;

  const stock = collateralTokens.find((s) => s.symbol === position.collateralStock);
  // 온체인 가격 사용 (주소 또는 symbol로 조회)
  const stockPrice = stock
    ? onChainPrices[stock.symbol] || onChainPrices[stock.address.toLowerCase()] || 0
    : 0;
  const userStockBalance = user.stocks?.[position.collateralStock] || 0;

  const addAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const addValue = addAmount * stockPrice;

  // 온체인 데이터 우선 사용
  const accruedInterest =
    onChainAccruedInterest > 0 ? onChainAccruedInterest : position.accruedInterest;

  const currentCollateralValue = position.collateralAmount * stockPrice;
  const newCollateralAmount = position.collateralAmount + addAmount;
  const newCollateralValue = newCollateralAmount * stockPrice;
  const debtValue = position.loanAmount + accruedInterest;

  // liquidation threshold: 온체인 데이터 사용
  const liquidationBps = stock
    ? riskParams[stock.symbol]?.liquidationBps || BigInt(8500)
    : BigInt(8500);
  const liquidationThreshold = Number(liquidationBps) / 10000; // bps to decimal (예: 8500 bps = 0.85 = 85%)

  // Health Factor: 온체인 값이 있으면 사용, 없으면 클라이언트에서 계산
  const currentHealthFactor =
    onChainHealthFactor > 0
      ? onChainHealthFactor
      : debtValue > 0 && currentCollateralValue > 0
      ? currentCollateralValue / (debtValue * liquidationThreshold)
      : 0;

  const currentLtv = currentCollateralValue > 0 ? (debtValue / currentCollateralValue) * 100 : 0;
  const newLtv = newCollateralValue > 0 ? (debtValue / newCollateralValue) * 100 : 0;

  // 추가 후 예상 Health Factor: 현재 Health Factor를 기준으로 담보 가치 비율로 계산
  // 이렇게 하면 현재 Health Factor가 온체인 값이든 클라이언트 계산 값이든 일관성 있게 계산됨
  const newHealthFactor =
    currentHealthFactor > 0 && currentCollateralValue > 0 && newCollateralValue > 0
      ? (currentHealthFactor * newCollateralValue) / currentCollateralValue
      : newCollateralValue > 0 && debtValue > 0
      ? newCollateralValue / (debtValue * liquidationThreshold)
      : 0;
  const newLiquidationPrice =
    newCollateralAmount > 0 ? (debtValue * liquidationThreshold) / newCollateralAmount : 0;

  const canAdd = addAmount > 0 && addAmount <= userStockBalance;

  const percentButtons = [10, 25, 50, 100];

  const handlePercent = (percent: number) => {
    const amt = Math.floor(userStockBalance * (percent / 100));
    setAmount(amt.toString());
  };

  const generateTxHash = () => {
    const chars = '0123456789abcdef';
    let hash = '0x';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  };

  const handleSubmit = async () => {
    if (!canAdd || !position.onChainId) return;

    setShowTx(true);
    setIsComplete(false);
    setTxError(null);

    const tokenSymbol = stock?.symbol || stock?.name || position.collateralStock || '담보';
    const userAddress = getCustodyWalletAddress(user.id);
    if (!userAddress) {
      setTxError('월렛 주소를 찾을 수 없습니다.');
      return;
    }

    const steps: TxStep[] = [
      { id: 'verify', label: '포지션 정보 확인', status: 'active' },
      { id: 'pledge', label: '추가 담보 질권설정', status: 'pending' },
      { id: 'tokenize', label: `${tokenSymbol} 토큰화`, status: 'pending' },
      { id: 'transfer', label: '담보토큰 컨트랙트 전송', status: 'pending' },
      { id: 'update', label: '포지션 업데이트', status: 'pending' },
      { id: 'tx', label: '트랜잭션 완료', status: 'pending' },
    ];

    setTxSteps(steps);

    try {
      // Step 1: ETH 잔액 확인 및 전송
      await ensureEthBalance(userAddress);
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'verify'
            ? { ...s, status: 'complete' }
            : s.id === 'pledge'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 2: 레거시 시스템 연동 - 추가 담보 질권설정 (시뮬레이션)
      const legacyDelay = Math.floor(Math.random() * 3000) + 2000; // 2~5초 랜덤 대기
      await new Promise((resolve) => setTimeout(resolve, legacyDelay));
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'pledge'
            ? { ...s, status: 'complete' }
            : s.id === 'tokenize'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 3: 담보 → 담보 토큰 발행 (Master Mint)
      const collateralAmountInWei = parseUnits(addAmount.toString(), 18);
      await mintTokenByMaster('collateral', userAddress, collateralAmountInWei);
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'tokenize'
            ? { ...s, status: 'complete' }
            : s.id === 'transfer'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 4: 담보 토큰 Approve
      await approveTokenForLending('collateral', collateralAmountInWei, user.id);
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'transfer'
            ? { ...s, status: 'complete' }
            : s.id === 'update'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 5: addCollateral 컨트랙트 호출
      const offerId = position.onChainId;
      const hash = await addCollateral(offerId, collateralAmountInWei, user.id);
      setTxHash(hash);
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'update'
            ? { ...s, status: 'complete' }
            : s.id === 'tx'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 6: 트랜잭션 확인 (waitForTransaction이 이미 addCollateral 내부에서 호출됨)
      setTxSteps((prev) => prev.map((s) => (s.id === 'tx' ? { ...s, status: 'complete' } : s)));

      // 주식 차감 (burn 완료 직후가 아니라 컨트랙트 호출 완료 후)
      updateUserStocks(position.collateralStock, -addAmount);
      updatePosition(position.id, {
        collateralAmount: newCollateralAmount,
        healthFactor: newHealthFactor,
        liquidationPrice: newLiquidationPrice,
      });
      saveCurrentUser();

      setIsComplete(true);
    } catch (error) {
      console.error('Add collateral error:', error);
      setTxError(error instanceof Error ? error.message : 'Unknown error occurred');
      setTxSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s)),
      );
    }
  };

  const handleClose = () => {
    setShowTx(false);
    setTxSteps([]);
    setTxHash('');
    setIsComplete(false);
    setTxError(null);
    setAmount('');
    onClose();
  };

  if (showTx) {
    return (
      <TransactionModal
        open={showTx}
        onClose={handleClose}
        title="담보 추가 중"
        steps={txSteps}
        txHash={txHash}
        isComplete={isComplete}
        error={txError}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            담보 추가
          </DialogTitle>
          <DialogDescription>
            담보를 추가하여 청산 위험을 낮추고 Health Factor를 개선하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 현재 포지션 정보 */}
          <div className="rounded-lg bg-secondary p-4">
            <h4 className="mb-3 text-sm font-medium">현재 포지션</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">담보</span>
                <span className="font-medium">
                  {position.collateralAmount.toLocaleString()}주 {stock?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">담보 가치</span>
                <span className="font-mono">₩{currentCollateralValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">대출금 + 이자</span>
                <span className="font-mono">₩{debtValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">현재 LTV</span>
                <span className={`font-mono ${currentLtv > 70 ? 'text-destructive' : ''}`}>
                  {currentLtv.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Health Factor</span>
                <span
                  className={`font-mono font-bold ${
                    currentHealthFactor >= 1.5
                      ? 'text-primary'
                      : currentHealthFactor >= 1.2
                      ? 'text-yellow-500'
                      : 'text-destructive'
                  }`}
                >
                  {currentHealthFactor.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* 담보 추가 입력 */}
          <div className="space-y-2">
            <Label>추가할 담보 수량</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min="1"
                max={userStockBalance}
              />
              <span className="text-sm text-muted-foreground">주</span>
            </div>
            <div className="flex gap-2">
              {percentButtons.map((percent) => (
                <Button
                  key={percent}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-transparent"
                  onClick={() => handlePercent(percent)}
                >
                  {percent}%
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              보유 가능: {userStockBalance.toLocaleString()}주 {stock?.name}
            </p>
            {addAmount > 0 && (
              <p className="text-sm text-primary">추가 담보 가치: ₩{addValue.toLocaleString()}</p>
            )}
          </div>

          {/* 추가 후 예상 */}
          {addAmount > 0 && (
            <div className="rounded-lg border border-primary/50 bg-primary/5 p-4">
              <h4 className="mb-3 text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                추가 후 예상
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">새 담보 수량</span>
                  <span className="font-medium">
                    {newCollateralAmount.toLocaleString()}주 {stock?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">새 담보 가치</span>
                  <span className="font-mono">₩{newCollateralValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">새 LTV</span>
                  <span className="font-mono text-primary">{newLtv.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">새 Health Factor</span>
                  <span className="font-mono font-bold text-primary">
                    {newHealthFactor.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">새 청산 가격</span>
                  <span className="font-mono">₩{newLiquidationPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* 진행 과정 안내 */}
          <div className="rounded-lg border border-border p-4">
            <h4 className="mb-3 text-sm font-medium">담보 추가 시 진행 과정</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                  1
                </div>
                <span>추가 담보 {addAmount || 0}주 질권설정</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                  2
                </div>
                <span>
                  {stock?.symbol || stock?.name || position.collateralStock || '담보'} 토큰화
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                  3
                </div>
                <span>담보토큰 컨트랙트 전송</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                  4
                </div>
                <span>포지션 정보 업데이트</span>
              </div>
            </div>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={!canAdd}>
            담보 추가하기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
