'use client';

import { useState, useEffect } from 'react';
import { parseUnits } from 'viem';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore } from '@/lib/store';
import { mapCollateralTokens, CONTRACTS } from '@/lib/contracts/config';
import {
  useOraclePricesWagmi,
  useCollateralRiskParamsWagmi,
  useAllowedCollateralTokensWagmi,
  type UIBorrowOffer,
  type UILendOffer,
} from '@/lib/hooks';
import { takeBorrowOffer, takeLendOffer } from '@/lib/contracts/lending';
import { approveTokenForLending, mintTokenByMaster } from '@/lib/contracts/tokens';
import { getCustodyWalletAddress, ensureEthBalance } from '@/lib/wallet/custody';
import { TransactionModal, type TxStep } from './transaction-modal';
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

interface MatchModalProps {
  open: boolean;
  onClose: () => void;
  offer: UIBorrowOffer | UILendOffer;
  type: 'borrow' | 'lend';
}

export function MatchModal({ open, onClose, offer, type }: MatchModalProps) {
  const { user, updateUserCash, updateUserStocks, saveCurrentUser } = useStore();
  const { prices: oraclePrice } = useOraclePricesWagmi();
  const { riskParams } = useCollateralRiskParamsWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  const [showTx, setShowTx] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [txHash, setTxHash] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [collateralInput, setCollateralInput] = useState('');

  const isBorrowOffer = type === 'borrow'; // 대출 상품 (Borrow탭에서 보이는 상품)
  const borrowOffer = offer as UIBorrowOffer;
  const lendOffer = offer as UILendOffer;

  // 대출 상품 매칭 시: 내가 대여자가 됨 → 현금 필요
  // 대여 상품 매칭 시: 내가 대출자가 됨 → 담보 주식 필요
  const requiredCash = isBorrowOffer ? borrowOffer.loanAmount : 0;
  const requiredStock = !isBorrowOffer ? lendOffer.requestedCollateralStock : null;

  // 담보 토큰 정보 가져오기 (대출/대여 모두) - 온체인 데이터 사용
  const collateralSymbol = isBorrowOffer
    ? borrowOffer.collateralStock
    : lendOffer.requestedCollateralStock;
  const stock = collateralTokens.find((s) => s.symbol === collateralSymbol);
  const stockPrice = stock
    ? oraclePrice[stock.symbol] || oraclePrice[stock.address.toLowerCase()] || 0
    : 0;

  // 온체인에서 LTV 가져오기 (주소 또는 symbol로 조회)
  const maxLtvBps = stock
    ? riskParams[stock.symbol]?.maxLtvBps ||
      riskParams[stock.address.toLowerCase()]?.maxLtvBps ||
      riskParams[stock.address]?.maxLtvBps ||
      BigInt(6000)
    : BigInt(6000);
  const maxLtv = Number(maxLtvBps) / 10000; // bps to decimal (예: 7000 bps = 0.7 = 70%)

  // 대출 상품 매칭 시: 온체인 데이터로 LTV 계산
  const borrowCollateralValue = isBorrowOffer ? borrowOffer.collateralAmount * stockPrice : 0;
  const borrowLTV =
    isBorrowOffer && borrowCollateralValue > 0
      ? ((borrowOffer.loanAmount / borrowCollateralValue) * 100).toFixed(1)
      : '0';

  // 대여 상품 매칭 시 필요한 담보 수량 계산 (온체인 LTV 사용)
  const minCollateralAmount =
    !isBorrowOffer && stockPrice > 0 ? Math.ceil(lendOffer.loanAmount / stockPrice / maxLtv) : 0;
  const minCollateralValue = minCollateralAmount * stockPrice;

  useEffect(() => {
    if (!isBorrowOffer) {
      setCollateralInput(minCollateralAmount ? minCollateralAmount.toString() : '');
    } else {
      setCollateralInput('');
    }
  }, [isBorrowOffer, minCollateralAmount, open]);

  const parsedCollateral = Number(collateralInput);
  const collateralAmount =
    !isBorrowOffer && Number.isFinite(parsedCollateral)
      ? Math.max(0, Math.floor(parsedCollateral))
      : 0;
  const plannedCollateralAmount = collateralAmount > 0 ? collateralAmount : minCollateralAmount;
  const collateralValue = collateralAmount * stockPrice;

  // 입력된 담보 기준 LTV 계산 (대여 상품 매칭 시)
  const lendLTV =
    !isBorrowOffer && collateralValue > 0
      ? ((lendOffer.loanAmount / collateralValue) * 100).toFixed(1)
      : '0';

  const currentLTV = isBorrowOffer ? borrowLTV : lendLTV;

  // 최종 예상 이자 계산 (만기까지)
  const loanAmount = isBorrowOffer ? borrowOffer.loanAmount : lendOffer.loanAmount;
  const interestRate = offer.interestRate; // 연이자율 (%)
  const maturityDays = offer.maturityDays;
  // 일 단위 이자 계산: 대출금액 * (이자율 / 100) * (만기일수 / 365)
  const expectedInterest = (loanAmount * (interestRate / 100) * (maturityDays / 365)).toFixed(2);

  const userCash = user?.cash ?? 0;
  const userStockAmount = requiredStock ? user?.stocks?.[requiredStock] ?? 0 : 0;

  const meetsMinCollateral = collateralAmount >= minCollateralAmount && collateralAmount > 0;
  const hasStockBalance = collateralAmount > 0 && userStockAmount >= collateralAmount;
  const collateralInputValid = meetsMinCollateral && hasStockBalance;
  const hasEnoughBalance = isBorrowOffer ? userCash >= requiredCash : collateralInputValid;
  const collateralError = !isBorrowOffer
    ? collateralAmount === 0
      ? '담보 수량을 입력해주세요.'
      : !meetsMinCollateral
      ? `최소 ${minCollateralAmount}주 이상 입력해야 합니다.`
      : !hasStockBalance
      ? '보유 주식이 부족합니다. 포트폴리오에서 주식을 구매하세요.'
      : ''
    : '';

  const handleMatch = async () => {
    if (!user || !hasEnoughBalance) return;

    setShowTx(true);
    setIsComplete(false);
    setTxError(null);

    const steps: TxStep[] = isBorrowOffer
      ? [
          // 대출 상품 매칭: 나(대여자)가 현금을 대출자에게 빌려줌
          { id: 'legacy', label: '유저계좌 확인', status: 'active' },
          { id: 'tokenize_cash', label: '원화 → dKRW 토큰화', status: 'pending' },
          { id: 'approve', label: 'dKRW 토큰 Approve', status: 'pending' },
          { id: 'tx', label: '매칭 트랜잭션 실행', status: 'pending' },
          { id: 'confirm', label: '트랜잭션 확인', status: 'pending' },
        ]
      : [
          // 대여 상품 매칭: 나(대출자)가 담보를 맡기고 대여금을 받음
          { id: 'legacy', label: '유저계좌 확인', status: 'active' },
          { id: 'pledge', label: '담보 주식 질권설정', status: 'pending' },
          { id: 'tokenize_collateral', label: '담보 → 토큰화', status: 'pending' },
          { id: 'approve', label: '담보 토큰 Approve', status: 'pending' },
          { id: 'tx', label: '매칭 트랜잭션 실행', status: 'pending' },
          { id: 'confirm', label: '트랜잭션 확인', status: 'pending' },
        ];

    setTxSteps(steps);

    try {
      // 유저 주소 확인
      if (!user) {
        throw new Error('No user logged in');
      }
      const userAddress = getCustodyWalletAddress(user.id);
      if (!userAddress) {
        throw new Error('No custody wallet found');
      }

      // ETH 잔액 확인 및 전송
      await ensureEthBalance(userAddress);

      // Step 1: 레거시 시스템 연동 (유저계좌 확인)
      const legacyDelay = Math.floor(Math.random() * 3000) + 2000; // 2000~5000ms
      await new Promise((resolve) => setTimeout(resolve, legacyDelay));
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'legacy'
            ? { ...s, status: 'complete' }
            : s.id === (isBorrowOffer ? 'tokenize_cash' : 'pledge')
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      if (isBorrowOffer) {
        // 대출 상품 매칭: 나(대여자)가 현금을 대출자에게 빌려줌
        const loanAmountInWei = parseUnits(requiredCash.toString(), 18);

        // Step 2: 원화 → dKRW 토큰화 (Master Mint)
        await mintTokenByMaster('lend', userAddress, loanAmountInWei);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'tokenize_cash'
              ? { ...s, status: 'complete' }
              : s.id === 'approve'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 3: dKRW 토큰 Approve
        await approveTokenForLending('lend', loanAmountInWei, user.id);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'approve'
              ? { ...s, status: 'complete' }
              : s.id === 'tx'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 4: takeBorrowOffer 컨트랙트 호출
        const offerId = borrowOffer.onChainId;
        const hash = await takeBorrowOffer(offerId, user.id);
        setTxHash(hash);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'tx'
              ? { ...s, status: 'complete' }
              : s.id === 'confirm'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 5: 트랜잭션 확인 (waitForTransaction이 이미 takeBorrowOffer 내부에서 호출됨)
        setTxSteps((prev) =>
          prev.map((s) => (s.id === 'confirm' ? { ...s, status: 'complete' } : s)),
        );

        // 대여자(나)의 현금 차감
        updateUserCash(-requiredCash);
        saveCurrentUser();
      } else {
        // 대여 상품 매칭: 나(대출자)가 담보를 맡기고 대여금을 받음
        const collateralAmountInWei = parseUnits(collateralAmount.toString(), 18);

        // Step 2: 담보 주식 질권설정 (시뮬레이션)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'pledge'
              ? { ...s, status: 'complete' }
              : s.id === 'tokenize_collateral'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 3: 담보 → 담보 토큰 발행 (Master Mint)
        await mintTokenByMaster('collateral', userAddress, collateralAmountInWei);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'tokenize_collateral'
              ? { ...s, status: 'complete' }
              : s.id === 'approve'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 4: 담보 토큰 Approve
        await approveTokenForLending('collateral', collateralAmountInWei, user.id);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'approve'
              ? { ...s, status: 'complete' }
              : s.id === 'tx'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 5: takeLendOffer 컨트랙트 호출
        const offerId = lendOffer.onChainId;
        const hash = await takeLendOffer(offerId, collateralAmountInWei, user.id);
        setTxHash(hash);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'tx'
              ? { ...s, status: 'complete' }
              : s.id === 'confirm'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 6: 트랜잭션 확인 (waitForTransaction이 이미 takeLendOffer 내부에서 호출됨)
        setTxSteps((prev) =>
          prev.map((s) => (s.id === 'confirm' ? { ...s, status: 'complete' } : s)),
        );

        // 대출자(나)의 주식 차감, 현금 증가
        updateUserStocks(lendOffer.requestedCollateralStock, -collateralAmount);
        updateUserCash(lendOffer.loanAmount);
        saveCurrentUser();
      }

      setIsComplete(true);
    } catch (error) {
      console.error('Match error:', error);
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
    onClose();
  };

  if (showTx) {
    return (
      <TransactionModal
        open={showTx}
        onClose={handleClose}
        title="매칭 진행 중"
        steps={txSteps}
        txHash={txHash}
        isComplete={isComplete}
        error={txError}
      />
    );
  }

  const stockInfo = isBorrowOffer
    ? collateralTokens.find((s) => s.symbol === borrowOffer.collateralStock)
    : collateralTokens.find((s) => s.symbol === lendOffer.requestedCollateralStock);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isBorrowOffer ? '대여 확인' : '대출 확인'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 상품 상세 정보 */}
          <div className="rounded-lg bg-secondary p-4">
            <h4 className="mb-3 text-sm font-medium flex items-center gap-2">
              상품 정보
              <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">
                {isBorrowOffer ? '대출 상품' : '대여 상품'}
              </span>
            </h4>
            <div className="space-y-2 text-sm">
              {isBorrowOffer ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">담보 종류</span>
                    <span className="font-medium">
                      {stockInfo?.name} ({stockInfo?.symbol})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">담보 수량</span>
                    <span className="font-mono">{borrowOffer.collateralAmount}주</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">담보 가치</span>
                    <span className="font-mono">
                      ₩
                      {(
                        borrowOffer.collateralAmount *
                        (oraclePrice[borrowOffer.collateralStock] || 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="border-t border-border my-2" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">대출 희망 금액</span>
                    <span className="font-mono text-primary">
                      ₩{borrowOffer.loanAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">대출 토큰</span>
                    <span className="font-mono">dKRW</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">대여 금액</span>
                    <span className="font-mono text-primary">
                      ₩{lendOffer.loanAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">대여 토큰</span>
                    <span className="font-mono">dKRW</span>
                  </div>
                  <div className="border-t border-border my-2" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">요구 담보 종류</span>
                    <span className="font-medium">
                      {stockInfo?.name} ({stockInfo?.symbol})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">최소 필요 담보 수량</span>
                    <span className="font-mono">{minCollateralAmount}주</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">최소 필요 담보 가치</span>
                    <span className="font-mono">₩{minCollateralValue.toLocaleString()}</span>
                  </div>
                </>
              )}
              <div className="border-t border-border my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">이자율 (연)</span>
                <span>{offer.interestRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">만기</span>
                <span>{offer.maturityDays}일</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">중도상환수수료</span>
                <span className="font-medium">
                  {offer.earlyRepayFeeBps ? (offer.earlyRepayFeeBps / 100).toFixed(1) : '0'}%
                </span>
              </div>
              {isBorrowOffer && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LTV</span>
                  <span>{borrowLTV}%</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">최종 예상 이자 (만기까지)</span>
                <span className="font-medium text-primary">
                  ₩{Number(expectedInterest).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {!isBorrowOffer && (
            <div className="rounded-lg border border-border p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">담보 수량 입력</p>
                    <p className="text-xs text-muted-foreground">
                      최소 {minCollateralAmount}주 · 최소 가치 ₩
                      {minCollateralValue.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={minCollateralAmount || 0}
                      step={1}
                      value={collateralInput}
                      onChange={(e) => setCollateralInput(e.target.value)}
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">주</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">입력 담보 가치</span>
                  <span className="font-mono text-foreground">
                    ₩{collateralValue.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">현재 LTV</span>
                  <span
                    className={`font-mono ${
                      Number(currentLTV) > 60 ? 'text-yellow-500' : 'text-primary'
                    }`}
                  >
                    {currentLTV}%
                  </span>
                </div>
              </div>
              {collateralError && (
                <p className="mt-3 text-sm text-destructive">{collateralError}</p>
              )}
            </div>
          )}

          {/* 매칭 시 발생하는 흐름 */}
          <div className="rounded-lg border border-border p-4">
            <h4 className="mb-3 text-sm font-medium">매칭 시 진행 과정</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              {isBorrowOffer ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      1
                    </div>
                    <span>질권설정 변경 (대출자 → 대여자)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      2
                    </div>
                    <span>대여자 위임 설정</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      3
                    </div>
                    <span>원화 ₩{requiredCash.toLocaleString()} → dKRW 토큰화</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      4
                    </div>
                    <span>대여토큰 전송 (나 → 대출자)</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      1
                    </div>
                    <span>담보 주식 {plannedCollateralAmount}주 질권설정</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      2
                    </div>
                    <span>질권설정 변경 (나 → 대여자) 및 위임</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      3
                    </div>
                    <span>담보 → {stockInfo?.symbol} 토큰화 (컨트랙트 전송)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      4
                    </div>
                    <span>대여토큰 ₩{lendOffer.loanAmount.toLocaleString()} dKRW 수령</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 내 잔고 확인 */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {isBorrowOffer ? '필요한 현금' : '입력 담보'}
              </p>
              <p className="text-lg font-bold">
                {isBorrowOffer
                  ? `₩${requiredCash.toLocaleString()}`
                  : collateralAmount > 0
                  ? `${collateralAmount}주 ${stockInfo?.name}`
                  : '담보 수량을 입력하세요'}
              </p>
              {!isBorrowOffer && (
                <p className="text-xs text-muted-foreground">
                  최소 필요: {minCollateralAmount}주 / ₩{minCollateralValue.toLocaleString()}
                </p>
              )}
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="text-right">
              <p className="text-sm text-muted-foreground">내 보유량</p>
              <p
                className={`text-lg font-bold ${
                  hasEnoughBalance ? 'text-primary' : 'text-destructive'
                }`}
              >
                {isBorrowOffer ? `₩${userCash.toLocaleString()}` : `${userStockAmount}주`}
              </p>
            </div>
          </div>

          {!hasEnoughBalance && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {isBorrowOffer
                ? '현금이 부족합니다. 포트폴리오에서 원화를 구매하세요.'
                : collateralError || '담보 주식이 부족합니다. 포트폴리오에서 주식을 구매하세요.'}
            </div>
          )}

          {hasEnoughBalance && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {isBorrowOffer
                ? '매칭 조건을 충족합니다. 대여를 진행할 수 있습니다.'
                : '매칭 조건을 충족합니다. 대출을 진행할 수 있습니다.'}
            </div>
          )}

          <Button onClick={handleMatch} className="w-full" disabled={!hasEnoughBalance}>
            {isBorrowOffer ? '대여하기' : '대출받기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
