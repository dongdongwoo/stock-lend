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
import { Banknote, CheckCircle2 } from 'lucide-react';
import {
  useOraclePricesWagmi,
  usePositionDataWagmi,
  useCollateralRiskParamsWagmi,
  useAllowedCollateralTokensWagmi,
} from '@/lib/hooks';
import { useReadContract } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts/config';
import { lendingAbi } from '@/lib/contracts/abis/lending';
import { parseUnits, formatUnits } from 'viem';
import { repay, repayAll } from '@/lib/contracts/lending';
import { mintTokenByMaster, approveTokenForLending } from '@/lib/contracts/tokens';
import { getCustodyWalletAddress, ensureEthBalance } from '@/lib/wallet/custody';

interface RepayModalProps {
  open: boolean;
  onClose: () => void;
  position: (Position & { onChainId?: bigint }) | null;
}

export function RepayModal({ open, onClose, position }: RepayModalProps) {
  const { user, updatePosition, updateUserCash, updateUserStocks, saveCurrentUser } = useStore();

  // 온체인 데이터 조회
  const { prices: onChainPrices } = useOraclePricesWagmi();
  const { riskParams } = useCollateralRiskParamsWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();
  const { accruedInterest: onChainAccruedInterest, healthFactor: onChainHealthFactor } =
    usePositionDataWagmi(position?.onChainId ? position.onChainId : null);

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  // earlyRepayFeeBps 조회
  const { data: borrowOfferData } = useReadContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'borrowOffers',
    args: position?.onChainId ? [position.onChainId] : undefined,
    query: {
      enabled: !!position?.onChainId,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // 온체인 데이터 파싱 (principalDebt, earlyRepayFeeBps)
  // 실제 컨트랙트 BorrowOffer struct 순서 (ABI 수정 완료):
  // id(0), borrower(1), lender(2), collateralToken(3), lendToken(4),
  // collateralAmount(5), loanAmount(6), principalDebt(7), interestRateBps(8),
  // duration(9), createdAt(10), matchedAt(11), expiresAt(12),
  // lastInterestTimestamp(13), earlyRepayFeeBps(14), interestPaid(15), state(16)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let principalDebtValue: bigint = BigInt(0);
  let earlyRepayFeeBpsValue: bigint = BigInt(0);
  if (borrowOfferData) {
    try {
      if (Array.isArray(borrowOfferData)) {
        // 배열인 경우 인덱스로 접근
        const principalDebtRaw = (borrowOfferData as any)[7];
        principalDebtValue =
          principalDebtRaw !== undefined && principalDebtRaw !== null
            ? BigInt(principalDebtRaw)
            : BigInt(0);

        const earlyRepayFeeBpsRaw = (borrowOfferData as any)[14];
        earlyRepayFeeBpsValue =
          earlyRepayFeeBpsRaw !== undefined && earlyRepayFeeBpsRaw !== null
            ? BigInt(earlyRepayFeeBpsRaw)
            : BigInt(0);
      } else {
        // 객체인 경우 프로퍼티로 접근
        const principalDebtRaw = (borrowOfferData as any).principalDebt;
        principalDebtValue =
          principalDebtRaw !== undefined && principalDebtRaw !== null
            ? BigInt(principalDebtRaw)
            : BigInt(0);

        const earlyRepayFeeBpsRaw = (borrowOfferData as any).earlyRepayFeeBps;
        earlyRepayFeeBpsValue =
          earlyRepayFeeBpsRaw !== undefined && earlyRepayFeeBpsRaw !== null
            ? BigInt(earlyRepayFeeBpsRaw)
            : BigInt(0);
      }
    } catch (error) {
      console.error('Error parsing borrowOfferData:', error);
      principalDebtValue = BigInt(0);
      earlyRepayFeeBpsValue = BigInt(0);
    }
  }

  const [amount, setAmount] = useState('');
  const [showTx, setShowTx] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [txHash, setTxHash] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [isFullRepayMode, setIsFullRepayMode] = useState(false);

  if (!position || !user) return null;

  const stock = collateralTokens.find((s) => s.symbol === position.collateralStock);
  // 온체인 가격 사용 (주소 또는 symbol로 조회)
  const stockPrice = stock
    ? onChainPrices[stock.symbol] || onChainPrices[stock.address.toLowerCase()] || 0
    : 0;

  // 온체인 데이터 우선 사용
  const accruedInterest =
    onChainAccruedInterest > 0 ? onChainAccruedInterest : position.accruedInterest;

  // 온체인 principalDebt 사용 (상환 후 변경된 원금 반영)
  const onChainPrincipalDebt =
    principalDebtValue > BigInt(0)
      ? Number(formatUnits(principalDebtValue, 18))
      : position.loanAmount;
  const currentLoanAmount = onChainPrincipalDebt;

  const totalDebt = currentLoanAmount + accruedInterest;
  const userCash = user.cash || 0;

  const repayAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const isFullRepay = isFullRepayMode || repayAmount >= totalDebt;

  // 중도상환수수료 계산 (만기일 이전 상환 시 원금에 대해 적용)
  // earlyRepayFeeBps는 basis points (10000 = 100%)
  // bigint를 안전하게 number로 변환
  // earlyRepayFeeBps는 일반적으로 0~10000 사이의 값 (0~100%)
  // 비정상적으로 큰 값(예: 10000보다 큰 값)은 무시
  const earlyRepayFeeBpsNum = Number(earlyRepayFeeBpsValue);
  const isValidBps = earlyRepayFeeBpsNum >= 0 && earlyRepayFeeBpsNum <= 10000;
  const earlyRepayFeeRate = isValidBps && earlyRepayFeeBpsNum > 0 ? earlyRepayFeeBpsNum / 10000 : 0; // bps to decimal
  const isBeforeMaturity = position.maturityDate > Date.now();

  // 상환하려는 원금 계산 (상환 금액이 이자보다 많으면 원금 일부 상환)
  const principalToRepay = Math.max(0, Math.min(repayAmount - accruedInterest, currentLoanAmount));
  const earlyRepayFee =
    isBeforeMaturity && principalToRepay > 0 && earlyRepayFeeRate > 0
      ? Math.floor(principalToRepay * earlyRepayFeeRate)
      : 0;

  // 실제 상환 금액 (원금 + 이자 + 중도상환수수료)
  const actualRepayAmount = isFullRepay
    ? totalDebt +
      (isBeforeMaturity && earlyRepayFeeRate > 0
        ? Math.floor(currentLoanAmount * earlyRepayFeeRate)
        : 0)
    : repayAmount + earlyRepayFee;

  // remainingDebt 계산 시 중도상환수수료는 별도로 처리되므로 원래 부채에서만 차감
  const debtRepaid = isFullRepay ? totalDebt : Math.min(repayAmount, totalDebt);
  const remainingDebt = Math.max(0, totalDebt - debtRepaid);
  const collateralValue = position.collateralAmount * stockPrice;

  // liquidation threshold: 온체인 데이터 사용
  const liquidationBps = stock
    ? riskParams[stock.symbol]?.liquidationBps || BigInt(8500)
    : BigInt(8500);
  const liquidationThreshold = Number(liquidationBps) / 10000; // bps to decimal (예: 8500 bps = 0.85 = 85%)

  // Health Factor: 온체인 값이 있으면 사용, 없으면 클라이언트에서 계산
  const currentHealthFactor =
    onChainHealthFactor > 0
      ? onChainHealthFactor
      : totalDebt > 0 && collateralValue > 0
      ? collateralValue / (totalDebt * liquidationThreshold)
      : 0;

  const newLtv =
    remainingDebt > 0 && collateralValue > 0 ? (remainingDebt / collateralValue) * 100 : 0;
  const newHealthFactor =
    remainingDebt > 0 && collateralValue > 0
      ? collateralValue / (remainingDebt * liquidationThreshold)
      : Infinity;
  const newLiquidationPrice =
    remainingDebt > 0 && position.collateralAmount > 0
      ? (remainingDebt * liquidationThreshold) / position.collateralAmount
      : 0;

  // 1원 미만의 소액 상환도 허용 (원금 잔액 정리용)
  const canRepay = actualRepayAmount > 0 && actualRepayAmount <= userCash;

  const percentButtons = [25, 50, 75, 100];

  const handlePercent = (percent: number) => {
    if (percent === 100) {
      setIsFullRepayMode(true);
      setAmount(totalDebt.toString());
    } else {
      setIsFullRepayMode(false);
      const amt = Math.floor(totalDebt * (percent / 100));
      setAmount(Math.min(amt, userCash).toString());
    }
  };

  const handleAmountChange = (value: string) => {
    setIsFullRepayMode(false);
    setAmount(value);
  };

  const handleSubmit = async () => {
    if (!canRepay || !position.onChainId) return;

    setShowTx(true);
    setIsComplete(false);
    setTxError(null);

    const userAddress = getCustodyWalletAddress(user.id);
    if (!userAddress) {
      setTxError('월렛 주소를 찾을 수 없습니다.');
      return;
    }

    const steps: TxStep[] = isFullRepay
      ? [
          { id: 'verify', label: '포지션 정보 확인', status: 'active' },
          { id: 'legacy', label: '레거시 시스템 연동', status: 'pending' },
          { id: 'tokenize', label: '원화 → dKRW 토큰화', status: 'pending' },
          { id: 'approve', label: 'dKRW 토큰 Approve', status: 'pending' },
          { id: 'repay', label: '전액 상환', status: 'pending' },
          { id: 'legacy_read', label: '레거시 시스템 이벤트 수신', status: 'pending' },
          { id: 'pledge_release', label: '질권 해제', status: 'pending' },
          { id: 'stock_transfer', label: '담보 주식 유저에게 전달', status: 'pending' },
          { id: 'tx', label: '정산 완료', status: 'pending' },
        ]
      : [
          { id: 'verify', label: '포지션 정보 확인', status: 'active' },
          { id: 'legacy', label: '레거시 시스템 연동', status: 'pending' },
          { id: 'tokenize', label: '원화 → dKRW 토큰화', status: 'pending' },
          { id: 'approve', label: 'dKRW 토큰 Approve', status: 'pending' },
          { id: 'repay', label: '일부 상환', status: 'pending' },
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
            : s.id === 'legacy'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 2: 레거시 시스템 연동 (시뮬레이션)
      const legacyDelay = Math.floor(Math.random() * 1000) + 4000; // 4~5초 랜덤 대기
      await new Promise((resolve) => setTimeout(resolve, legacyDelay));
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'legacy'
            ? { ...s, status: 'complete' }
            : s.id === 'tokenize'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 3: 원화 → dKRW 토큰화 (Master Mint)
      // 상환 금액은 원금 + 이자 + 중도상환수수료
      // toFixed(18)을 사용하여 과학적 표기법 방지 (매우 작은 값 처리)
      const repayAmountInWei = parseUnits(actualRepayAmount.toFixed(18), 18);
      await mintTokenByMaster('lend', userAddress, repayAmountInWei);
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'tokenize'
            ? { ...s, status: 'complete' }
            : s.id === 'approve'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 4: dKRW 토큰 Approve
      // 전액 상환 시: approve와 실제 상환 사이 이자 증가를 대비해 1% 버퍼 추가
      const approveAmountInWei = isFullRepay
        ? parseUnits((actualRepayAmount * 1.01).toFixed(18), 18)
        : repayAmountInWei;
      await approveTokenForLending('lend', approveAmountInWei, user.id);
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'approve'
            ? { ...s, status: 'complete' }
            : s.id === 'repay'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // Step 5: 상환 컨트랙트 호출
      const offerId = position.onChainId;
      let hash: `0x${string}`;
      if (isFullRepay) {
        // 전액 상환
        hash = await repayAll(offerId, user.id);
        setTxHash(hash);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'repay'
              ? { ...s, status: 'complete' }
              : s.id === 'legacy_read'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 6: 레거시 시스템 이벤트 수신 (시뮬레이션)
        const legacyDelay = Math.floor(Math.random() * 1000) + 4000; // 4~5초 랜덤 대기
        await new Promise((resolve) => setTimeout(resolve, legacyDelay));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'legacy_read'
              ? { ...s, status: 'complete' }
              : s.id === 'pledge_release'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 7: 질권 해제 (시뮬레이션)
        const pledgeReleaseDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
        await new Promise((resolve) => setTimeout(resolve, pledgeReleaseDelay));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'pledge_release'
              ? { ...s, status: 'complete' }
              : s.id === 'stock_transfer'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 8: 담보 주식 유저에게 전달 (시뮬레이션)
        const stockTransferDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
        await new Promise((resolve) => setTimeout(resolve, stockTransferDelay));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'stock_transfer'
              ? { ...s, status: 'complete' }
              : s.id === 'tx'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // 상태 업데이트: 전액 상환 - 담보 반환, 포지션 종료
        updateUserCash(-actualRepayAmount);
        updateUserStocks(position.collateralStock, position.collateralAmount);
        updatePosition(position.id, {
          status: 'closed',
          loanAmount: 0,
          accruedInterest: 0,
        });

        // Step 9: 정산 완료
        setTxSteps((prev) => prev.map((s) => (s.id === 'tx' ? { ...s, status: 'complete' } : s)));
      } else {
        // 일부 상환 (상환 금액은 원금 + 이자만, 중도상환수수료는 컨트랙트에서 자동 계산)
        // toFixed(18)을 사용하여 과학적 표기법 방지 (매우 작은 값 처리)
        const debtRepayAmountInWei = parseUnits(debtRepaid.toFixed(18), 18);
        hash = await repay(offerId, debtRepayAmountInWei, user.id);
        setTxHash(hash);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'repay'
              ? { ...s, status: 'complete' }
              : s.id === 'tx'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 6: 트랜잭션 확인 (waitForTransaction이 이미 repay 내부에서 호출됨)
        setTxSteps((prev) => prev.map((s) => (s.id === 'tx' ? { ...s, status: 'complete' } : s)));

        // 상태 업데이트: 일부 상환
        updateUserCash(-actualRepayAmount);
        // 일부 상환: 대출금 감소 (온체인 principalDebt 기준으로 계산)
        const newLoanAmount = Math.max(0, currentLoanAmount - debtRepaid);
        const newAccruedInterest =
          debtRepaid > currentLoanAmount
            ? Math.max(0, accruedInterest - (debtRepaid - currentLoanAmount))
            : accruedInterest;

        updatePosition(position.id, {
          loanAmount: newLoanAmount,
          accruedInterest: newAccruedInterest,
          healthFactor: newHealthFactor === Infinity ? 999 : newHealthFactor,
          liquidationPrice: newLiquidationPrice,
        });
      }
      saveCurrentUser();

      setIsComplete(true);
    } catch (error) {
      console.error('Repay error:', error);
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
    setIsFullRepayMode(false);
    onClose();
  };

  if (showTx) {
    return (
      <TransactionModal
        open={showTx}
        onClose={handleClose}
        title={isFullRepay ? '전액 상환 중' : '일부 상환 중'}
        steps={txSteps}
        txHash={txHash}
        isComplete={isComplete}
        error={txError}
      />
    );
  }

  // 트랜잭션 진행 중일 때는 모달 닫기 방지
  const handleOpenChange = (newOpen: boolean) => {
    // 트랜잭션이 진행 중이 아닐 때만 닫기 허용
    if (!newOpen && !showTx) {
      onClose();
    }
    // showTx가 true일 때는 닫기 무시 (TransactionModal에서 처리)
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            대출 상환
          </DialogTitle>
          <DialogDescription>
            대출금과 이자를 상환하세요. 전액 상환 시 담보가 반환됩니다.
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
                <span className="font-mono">₩{collateralValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">현재 LTV</span>
                <span
                  className={`font-mono ${
                    (totalDebt / collateralValue) * 100 > 70 ? 'text-destructive' : ''
                  }`}
                >
                  {collateralValue > 0 ? ((totalDebt / collateralValue) * 100).toFixed(1) : '0.0'}%
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
              <div className="border-t border-border my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">대출 원금</span>
                <span className="font-mono">₩{currentLoanAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">누적 이자</span>
                <span className="font-mono text-yellow-500">
                  +₩{accruedInterest.toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between font-medium">
                <span>총 상환 필요액 (중도 상환 수수료 포함)</span>
                <span className="font-mono text-primary">
                  ₩
                  {(
                    totalDebt +
                    (isBeforeMaturity && earlyRepayFeeRate > 0
                      ? Math.floor(currentLoanAmount * earlyRepayFeeRate)
                      : 0)
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* 상환 금액 입력 */}
          <div className="space-y-2">
            <Label>상환 금액</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                min="1"
                disabled={isFullRepayMode}
              />
              <span className="text-sm text-muted-foreground">원</span>
            </div>
            <div className="flex gap-2">
              {percentButtons.map((percent) => (
                <Button
                  key={percent}
                  type="button"
                  variant={percent === 100 && isFullRepayMode ? 'default' : 'outline'}
                  size="sm"
                  className={percent === 100 ? '' : 'flex-1 bg-transparent'}
                  onClick={() => handlePercent(percent)}
                >
                  {percent === 100 ? '전액 상환' : `${percent}%`}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">보유 현금: ₩{userCash.toLocaleString()}</p>
          </div>

          {/* 상환 후 예상 */}
          {repayAmount > 0 && (
            <div
              className={`rounded-lg border p-4 ${
                isFullRepay ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <h4 className="mb-3 text-sm font-medium flex items-center gap-2">
                {isFullRepay ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    전액 상환 예정
                  </>
                ) : (
                  '상환 후 예상'
                )}
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">상환 금액 (원금 + 이자)</span>
                  <span className="font-mono font-medium">₩{debtRepaid.toLocaleString()}</span>
                </div>
                {isBeforeMaturity && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">중도상환수수료</span>
                    <span
                      className={`font-mono ${
                        earlyRepayFee > 0 ? 'text-orange-500' : 'text-muted-foreground'
                      }`}
                    >
                      {earlyRepayFee > 0 ? `+₩${earlyRepayFee.toLocaleString()}` : '₩0'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t border-border pt-2">
                  <span>총 상환 금액</span>
                  <span className="font-mono text-primary">
                    ₩{actualRepayAmount.toLocaleString()}
                  </span>
                </div>
                {isFullRepay ? (
                  <>
                    <div className="border-t border-border my-2" />
                    <div className="flex justify-between text-primary">
                      <span>반환받을 담보</span>
                      <span className="font-medium">
                        {position.collateralAmount.toLocaleString()}주 {stock?.name}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      전액 상환 시 담보가 전부 반환되고 포지션이 종료됩니다.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">남은 부채</span>
                      <span className="font-mono">₩{remainingDebt.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">새 LTV</span>
                      <span className="font-mono text-primary">{newLtv.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">새 Health Factor</span>
                      <span className="font-mono font-bold text-primary">
                        {newHealthFactor === Infinity ? '∞' : newHealthFactor.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 진행 과정 안내 */}
          <div className="rounded-lg border border-border p-4">
            <h4 className="mb-3 text-sm font-medium">상환 시 진행 과정</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              {isFullRepay ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                      1
                    </div>
                    <span>원화 ₩{actualRepayAmount.toLocaleString()} → dKRW 토큰화</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                      2
                    </div>
                    <span>대출금 + 이자 상환</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                      3
                    </div>
                    <span>담보토큰 Burn</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                      4
                    </div>
                    <span>질권 해제 및 담보 {position.collateralAmount}주 반환</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                      5
                    </div>
                    <span>포지션 종료</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                      1
                    </div>
                    <span>원화 ₩{actualRepayAmount.toLocaleString()} → dKRW 토큰화</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                      2
                    </div>
                    <span>일부 상환 처리</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">
                      3
                    </div>
                    <span>포지션 정보 업데이트</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={!canRepay}>
            {isFullRepay ? '전액 상환하기' : '상환하기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
