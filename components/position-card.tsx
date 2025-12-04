'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type Position, useStore } from '@/lib/store';
import {
  useOraclePricesWagmi,
  usePositionDataWagmi,
  useCollateralRiskParamsWagmi,
} from '@/lib/hooks';
import { CONTRACTS } from '@/lib/contracts/config';
import { useReadContract } from 'wagmi';
import { lendingAbi } from '@/lib/contracts/abis/lending';
import { formatUnits } from 'viem';
import { Clock, AlertTriangle, ExternalLink, Shield, Flame } from 'lucide-react';

interface PositionCardProps {
  position: Position & { onChainId?: bigint };
  walletAddress?: string | null;
  onRepay?: () => void;
  onAddCollateral?: () => void;
  showActions?: boolean;
}

export function PositionCard({
  position,
  walletAddress,
  onRepay,
  onAddCollateral,
  showActions = true,
}: PositionCardProps) {
  const { user } = useStore();
  const { prices: onChainPrices } = useOraclePricesWagmi();
  const { riskParams } = useCollateralRiskParamsWagmi();

  // 온체인에서 Accrued Interest와 Health Factor 조회
  // onChainId가 있으면 type과 관계없이 조회 (lender인 경우에도 대출 포지션이므로 조회 가능)
  const { accruedInterest: onChainAccruedInterest, healthFactor: onChainHealthFactor } =
    usePositionDataWagmi(position.onChainId ? position.onChainId : null);

  // 온체인 principalDebt 조회
  const { data: borrowOfferData } = useReadContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'borrowOffers',
    args: position.onChainId ? [position.onChainId] : undefined,
    query: {
      enabled: !!position.onChainId,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // 온체인 데이터 파싱 (principalDebt)
  // 실제 컨트랙트 BorrowOffer struct 순서:
  // id(0), borrower(1), lender(2), collateralToken(3), lendToken(4),
  // collateralAmount(5), loanAmount(6), principalDebt(7), interestRateBps(8),
  // duration(9), createdAt(10), matchedAt(11), expiresAt(12),
  // lastInterestTimestamp(13), earlyRepayFeeBps(14), interestPaid(15), state(16)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let principalDebtValue: bigint = BigInt(0);
  if (borrowOfferData) {
    try {
      if (Array.isArray(borrowOfferData)) {
        // 배열인 경우 인덱스로 접근
        const principalDebtRaw = (borrowOfferData as any)[7];
        principalDebtValue =
          principalDebtRaw !== undefined && principalDebtRaw !== null
            ? BigInt(principalDebtRaw)
            : BigInt(0);
      } else {
        // 객체인 경우 프로퍼티로 접근
        const principalDebtRaw = (borrowOfferData as any).principalDebt;
        principalDebtValue =
          principalDebtRaw !== undefined && principalDebtRaw !== null
            ? BigInt(principalDebtRaw)
            : BigInt(0);
      }
    } catch (error) {
      console.error('Error parsing borrowOfferData:', error);
      principalDebtValue = BigInt(0);
    }
  }

  // 온체인 principalDebt 사용 (상환 후 변경된 원금 반영)
  const onChainPrincipalDebt =
    principalDebtValue > BigInt(0)
      ? Number(formatUnits(principalDebtValue, 18))
      : position.loanAmount;
  const currentLoanAmount = onChainPrincipalDebt;

  // walletAddress와 비교하여 borrower/lender 판단
  const currentWalletAddress = walletAddress?.toLowerCase() || null;
  const isBorrower =
    currentWalletAddress && position.borrowerId?.toLowerCase() === currentWalletAddress;
  const isLender =
    currentWalletAddress && position.lenderId?.toLowerCase() === currentWalletAddress;

  // 담보 토큰 주소 추출 (온체인 데이터에서 가져오거나 position에서 사용)
  let collateralTokenAddress = '';
  if (borrowOfferData) {
    try {
      if (Array.isArray(borrowOfferData)) {
        const collateralTokenRaw = (borrowOfferData as any)[3];
        collateralTokenAddress =
          collateralTokenRaw !== undefined && collateralTokenRaw !== null
            ? String(collateralTokenRaw).toLowerCase()
            : '';
      } else {
        const collateralTokenRaw = (borrowOfferData as any).collateralToken;
        collateralTokenAddress =
          collateralTokenRaw !== undefined && collateralTokenRaw !== null
            ? String(collateralTokenRaw).toLowerCase()
            : '';
      }
    } catch (error) {
      console.error('Error parsing collateralToken:', error);
    }
  }

  // 주소 또는 symbol로 가격 조회 (주소 우선)
  const tokenKey = collateralTokenAddress || position.collateralStock;
  const stockPrice = onChainPrices[tokenKey] || onChainPrices[position.collateralStock] || 0;
  const collateralValue = position.collateralAmount * stockPrice;

  // 온체인 데이터 사용 (있으면 온체인 데이터, 없으면 position 데이터)
  const accruedInterest =
    onChainAccruedInterest > 0 ? onChainAccruedInterest : position.accruedInterest;

  const debtValue = currentLoanAmount + accruedInterest;
  const currentLtv = collateralValue > 0 ? (debtValue / collateralValue) * 100 : 0;

  // Health Factor: 온체인에서 가져온 값이 있으면 사용, 없으면 클라이언트에서 계산
  // 주소 또는 symbol로 risk params 조회 (주소 우선)
  const liquidationBps =
    riskParams[tokenKey]?.liquidationBps ||
    riskParams[position.collateralStock]?.liquidationBps ||
    BigInt(8500);
  const liquidationThreshold = Number(liquidationBps) / 10000; // bps to decimal (예: 8500 bps = 0.85 = 85%)

  // Health Factor: 온체인 값이 있으면 사용 (이미 10000으로 나눈 값), 없으면 클라이언트에서 계산
  const healthFactor =
    onChainHealthFactor > 0
      ? onChainHealthFactor
      : debtValue > 0 && collateralValue > 0
      ? collateralValue / (debtValue * liquidationThreshold)
      : 0;

  // 올바른 청산 가격 공식: 담보물 수량 x 청산 가격 x 청산 bps = 부채
  // 따라서: 청산 가격 = 부채 / (담보물 수량 x 청산 threshold)
  const liquidationPrice =
    position.collateralAmount > 0 && liquidationThreshold > 0
      ? debtValue / (position.collateralAmount * liquidationThreshold)
      : 0;

  const daysRemaining = Math.max(
    0,
    Math.ceil((position.maturityDate - Date.now()) / (24 * 60 * 60 * 1000)),
  );

  const getHealthColor = (hf: number) => {
    if (hf >= 1.5) return 'text-primary';
    if (hf >= 1.2) return 'text-warning';
    return 'text-destructive';
  };

  const getStatusBadge = () => {
    switch (position.status) {
      case 'open':
        return <Badge className="bg-primary/20 text-primary">대여중</Badge>;
      case 'closed':
        return <Badge variant="secondary">Closed</Badge>;
      case 'liquidated':
        return <Badge className="bg-destructive/20 text-destructive">Liquidated</Badge>;
    }
  };

  return (
    <Card
      className={`overflow-hidden transition-all ${
        healthFactor < 1.2 && position.status === 'open' ? 'border-destructive/50' : ''
      }`}
    >
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                position.status === 'liquidated'
                  ? 'bg-destructive/20 text-destructive'
                  : position.status === 'closed'
                  ? 'bg-secondary text-muted-foreground'
                  : 'bg-primary/20 text-primary'
              }`}
            >
              {position.status === 'liquidated' ? (
                <Flame className="h-5 w-5" />
              ) : (
                <Shield className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="font-medium">{isBorrower ? '대출 포지션' : '대여 포지션'}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(position.matchedAt).toLocaleDateString('ko-KR')}
              </p>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">담보</span>
            <span className="font-mono font-medium">
              {position.collateralAmount} {position.collateralStock}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">담보 가치</span>
            <span className="font-mono">₩{collateralValue.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">대출 원금</span>
            <span className="font-mono">{currentLoanAmount.toLocaleString()} dKRW</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">설정 이자율</span>
            <span className="font-mono">{position.interestRate}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">누적 이자</span>
            <span className="font-mono text-warning">+{accruedInterest.toLocaleString()} dKRW</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">현재 LTV</span>
            <span
              className={`font-mono ${currentLtv > 70 ? 'text-destructive' : 'text-foreground'}`}
            >
              {currentLtv.toFixed(1)}%
            </span>
          </div>
        </div>

        {position.status === 'open' && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-secondary/50 p-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Health Factor</p>
              <p className={`text-lg font-bold ${getHealthColor(healthFactor)}`}>
                {healthFactor.toFixed(2)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">청산 가격</p>
              <p className="font-mono text-sm font-medium">₩{liquidationPrice.toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">남은 기간</span>
          </div>
          <span className={`font-medium ${daysRemaining <= 7 ? 'text-warning' : ''}`}>
            {daysRemaining}일
          </span>
        </div>

        {healthFactor < 1.2 && position.status === 'open' && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            청산 위험! 담보를 추가하거나 대출을 상환하세요
          </div>
        )}

        {showActions && position.status === 'open' && isBorrower && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 bg-transparent"
              onClick={onAddCollateral}
            >
              담보 추가
            </Button>
            <Button size="sm" className="flex-1" onClick={onRepay}>
              상환하기
            </Button>
          </div>
        )}

        {position.txHash && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full gap-2 text-muted-foreground"
            onClick={() =>
              window.open(`https://sepolia-explorer.giwa.io/tx/${position.txHash}`, '_blank')
            }
          >
            <ExternalLink className="h-3 w-3" />
            Explorer에서 확인
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
