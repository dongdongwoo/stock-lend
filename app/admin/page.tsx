'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { parseUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useStore, type Position } from '@/lib/store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TransactionModal, type TxStep } from '@/components/transaction-modal';
import {
  Shield,
  RefreshCw,
  Flame,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Lock,
  Unlock,
  Database,
  Loader2,
} from 'lucide-react';
import {
  useBorrowOffersWagmi,
  useLendOffersWagmi,
  useOraclePricesWagmi,
  usePositionDataWagmi,
  useCollateralRiskParamsWagmi,
  useAllowedCollateralTokensWagmi,
} from '@/lib/hooks';
import { useReadContract } from 'wagmi';
import { publicClient } from '@/lib/contracts/clients';
import { mapCollateralTokens, CONTRACTS } from '@/lib/contracts/config';
import { setPrice } from '@/lib/contracts/oracle';
import { OfferState, liquidate } from '@/lib/contracts/lending';
import { lendingAbi } from '@/lib/contracts/abis/lending';
import { formatUnits } from 'viem';
import type { UIBorrowOffer, UILendOffer } from '@/lib/hooks';
import { mintTokenByMaster, approveTokenForLending } from '@/lib/contracts/tokens';
import { getCustodyWalletAddress, ensureEthBalance } from '@/lib/wallet/custody';

// 컨트랙트 데이터 조회 섹션
function ContractDataSection() {
  const { prices: oraclePrices, error: pricesError } = useOraclePricesWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">온체인 데이터 조회</h3>

      {/* 컨트랙트 주소 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">컨트랙트 주소</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs font-mono">
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
            <span className="text-muted-foreground shrink-0">Oracle:</span>
            <span className="break-all sm:text-right">{CONTRACTS.oracle}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
            <span className="text-muted-foreground shrink-0">Lending:</span>
            <span className="break-all sm:text-right">{CONTRACTS.lending}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
            <span className="text-muted-foreground shrink-0">Collateral Token (한화):</span>
            <span className="break-all sm:text-right">{CONTRACTS.collateralToken}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
            <span className="text-muted-foreground shrink-0">Lend Token (dKRW):</span>
            <span className="break-all sm:text-right">{CONTRACTS.lendToken}</span>
          </div>
        </CardContent>
      </Card>

      {/* 오라클 가격 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">오라클 가격</CardTitle>
        </CardHeader>
        <CardContent>
          {pricesError ? (
            <p className="text-sm text-destructive">에러: {pricesError.message}</p>
          ) : (
            <div className="space-y-2">
              {collateralTokens.map((token) => (
                <div key={token.address} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span>{token.icon}</span>
                    <span>{token.name}</span>
                  </span>
                  <span className="font-mono">
                    ₩
                    {(
                      oraclePrices[token.symbol] ||
                      oraclePrices[token.address.toLowerCase()] ||
                      0
                    ).toLocaleString()}
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-2">
                마지막 조회: {new Date(oraclePrices.lastUpdated).toLocaleString('ko-KR')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// 온체인 포지션 데이터를 Position 타입으로 변환하는 헬퍼 함수
function convertOfferToPosition(
  offer: UIBorrowOffer | UILendOffer,
): (Position & { onChainId?: bigint }) | null {
  const isBorrowOffer = 'collateralStock' in offer;
  const borrowOffer = offer as UIBorrowOffer;
  const lendOffer = offer as UILendOffer;

  // matched 상태인 경우만 포지션으로 변환
  if (offer.status !== 'matched') return null;

  const borrowerId = isBorrowOffer
    ? borrowOffer.borrower.toLowerCase()
    : lendOffer.borrower?.toLowerCase() || '';
  const lenderId = isBorrowOffer
    ? borrowOffer.lender?.toLowerCase() || ''
    : lendOffer.lender.toLowerCase();

  const collateralStock = isBorrowOffer
    ? borrowOffer.collateralStock
    : lendOffer.requestedCollateralStock;
  const collateralAmount = offer.collateralAmount;
  const loanAmount = offer.loanAmount;
  const interestRate = offer.interestRate;
  const matchedAt = offer.matchedAt || Date.now();
  const maturityDays = offer.maturityDays;
  const maturityDate = matchedAt + maturityDays * 24 * 60 * 60 * 1000;

  // status 변환: 'matched' -> 'open', 'closed' -> 'closed', 'liquidated' -> 'liquidated'
  let status: 'open' | 'closed' | 'liquidated' = 'open';
  const offerStatus = offer.status as 'active' | 'matched' | 'closed' | 'cancelled' | 'liquidated';
  if (offerStatus === 'closed') {
    status = 'closed';
  } else if (offerStatus === 'liquidated') {
    status = 'liquidated';
  } else {
    // 'matched' 또는 기타 상태는 'open'으로 처리
    status = 'open';
  }

  // Health Factor와 Accrued Interest는 나중에 온체인에서 조회
  const accruedInterest = 0;
  const healthFactor = 0;
  const liquidationPrice = collateralAmount > 0 ? (loanAmount * 1.2) / collateralAmount : 0;

  return {
    id: offer.id,
    type: 'borrow' as const,
    borrowerId,
    lenderId,
    collateralStock,
    collateralAmount,
    loanCurrency: offer.loanCurrency,
    loanAmount,
    interestRate,
    maturityDate,
    matchedAt,
    status,
    accruedInterest,
    healthFactor,
    liquidationPrice,
    txHash: '',
    onChainId: offer.onChainId,
  } as Position & { onChainId?: bigint };
}

// 온체인 포지션 데이터를 조회하는 컴포넌트
function OnChainPositionCard({
  position,
  onLiquidate,
  onStatusChange,
}: {
  position: Position & { onChainId?: bigint };
  onLiquidate: (
    position: Position & { onChainId?: bigint },
    data: { currentLoanAmount: number; accruedInterest: number; debtValue: number },
  ) => void;
  onStatusChange?: (positionId: string, isLiquidatable: boolean, isAtRisk: boolean) => void;
}) {
  const { prices: onChainPrices } = useOraclePricesWagmi();
  const { riskParams } = useCollateralRiskParamsWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();
  const { accruedInterest: onChainAccruedInterest, healthFactor: onChainHealthFactor } =
    usePositionDataWagmi(position.onChainId ? position.onChainId : null);

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  // 온체인 principalDebt 및 state 조회
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

  // 온체인 데이터 파싱 (principalDebt, state)
  // 실제 컨트랙트 BorrowOffer struct 순서:
  // id(0), borrower(1), lender(2), collateralToken(3), lendToken(4),
  // collateralAmount(5), loanAmount(6), principalDebt(7), interestRateBps(8),
  // duration(9), createdAt(10), matchedAt(11), expiresAt(12),
  // lastInterestTimestamp(13), earlyRepayFeeBps(14), interestPaid(15), state(16)
  let principalDebtValue: bigint = BigInt(0);
  let onChainState: number = 2; // 기본값: Matched (2)
  if (borrowOfferData) {
    try {
      if (Array.isArray(borrowOfferData)) {
        const principalDebtRaw = (borrowOfferData as any)[7];
        principalDebtValue =
          principalDebtRaw !== undefined && principalDebtRaw !== null
            ? BigInt(principalDebtRaw)
            : BigInt(0);
        // state는 인덱스 16
        const stateRaw = (borrowOfferData as any)[16];
        onChainState =
          stateRaw !== undefined && stateRaw !== null ? Number(stateRaw) : 2;
      } else {
        const principalDebtRaw = (borrowOfferData as any).principalDebt;
        principalDebtValue =
          principalDebtRaw !== undefined && principalDebtRaw !== null
            ? BigInt(principalDebtRaw)
            : BigInt(0);
        const stateRaw = (borrowOfferData as any).state;
        onChainState =
          stateRaw !== undefined && stateRaw !== null ? Number(stateRaw) : 2;
      }
    } catch (error) {
      console.error('Error parsing borrowOfferData:', error);
      principalDebtValue = BigInt(0);
      onChainState = 2;
    }
  }

  // 온체인 상태 확인: Matched(2)가 아니면 표시하지 않음
  // Closed(3), Liquidated(5) 등은 필터링
  const isActiveOnChain = onChainState === 2; // Matched = 2

  const onChainPrincipalDebt =
    principalDebtValue > BigInt(0)
      ? Number(formatUnits(principalDebtValue, 18))
      : position.loanAmount;
  const currentLoanAmount = onChainPrincipalDebt;

  // 온체인 데이터 사용
  const accruedInterest =
    onChainAccruedInterest > 0 ? onChainAccruedInterest : position.accruedInterest;
  const healthFactor = onChainHealthFactor > 0 ? onChainHealthFactor : position.healthFactor;

  const stock = collateralTokens.find((s) => s.symbol === position.collateralStock);
  const stockPrice = stock
    ? onChainPrices[stock.symbol] || onChainPrices[stock.address.toLowerCase()] || 0
    : 0;
  const collateralValue = position.collateralAmount * stockPrice;
  const debtValue = currentLoanAmount + accruedInterest;

  const liquidationBps = stock
    ? riskParams[stock.symbol]?.liquidationBps || BigInt(8500)
    : BigInt(8500);
  const liquidationThreshold = Number(liquidationBps) / 10000;
  // 올바른 청산 가격 공식: 담보물 수량 x 청산 가격 x 청산 bps = 부채
  // 따라서: 청산 가격 = 부채 / (담보물 수량 x 청산 threshold)
  const liquidationPrice =
    position.collateralAmount > 0 && liquidationThreshold > 0
      ? debtValue / (position.collateralAmount * liquidationThreshold)
      : 0;

  const isLiquidatable = healthFactor < 1.0 && position.status === 'open' && isActiveOnChain;
  const isAtRisk = healthFactor < 1.2 && position.status === 'open' && isActiveOnChain;

  // 이전 상태를 추적하여 실제로 변경된 경우에만 호출
  const prevStatusRef = useRef<{ isLiquidatable: boolean; isAtRisk: boolean } | null>(null);

  // 상태 변경을 상위 컴포넌트에 알림 (실제로 변경된 경우에만)
  useEffect(() => {
    if (
      onStatusChange &&
      (!prevStatusRef.current ||
        prevStatusRef.current.isLiquidatable !== isLiquidatable ||
        prevStatusRef.current.isAtRisk !== isAtRisk)
    ) {
      prevStatusRef.current = { isLiquidatable, isAtRisk };
      onStatusChange(position.id, isLiquidatable, isAtRisk);
    }
  }, [position.id, isLiquidatable, isAtRisk]); // onStatusChange를 의존성에서 제거

  // 온체인에서 종료된 포지션은 표시하지 않음
  if (!isActiveOnChain) {
    return null;
  }

  return (
    <Card className={isAtRisk ? 'border-warning' : ''}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={healthFactor >= 1.2 ? 'default' : 'destructive'}>
                HF: {healthFactor.toFixed(2)}
              </Badge>
              <span className="text-sm text-muted-foreground">ID: {position.id}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span>
                담보: {position.collateralAmount}주 {position.collateralStock}
              </span>
              <span>대출: {currentLoanAmount.toLocaleString()} dKRW</span>
              <span>이자: +{accruedInterest.toLocaleString()} dKRW</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              청산가: ₩{Math.round(liquidationPrice).toLocaleString()}
            </span>
            {isLiquidatable && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  onLiquidate(position, {
                    currentLoanAmount,
                    accruedInterest,
                    debtValue,
                  })
                }
              >
                <Flame className="mr-2 h-4 w-4" />
                청산
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { user, updatePosition } = useStore();

  // 온체인 오라클 가격 조회 (wagmi)
  const { prices: onChainPrices } = useOraclePricesWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  // 온체인 오퍼 조회 (대시보드용, wagmi)
  const { offers: onChainBorrowOffers } = useBorrowOffersWagmi();
  const { offers: onChainLendOffers } = useLendOffersWagmi();

  // 온체인에서 matched 상태인 모든 포지션 조회
  const matchedBorrowOffers = onChainBorrowOffers.filter((o) => o.status === 'matched');
  const matchedLendOffers = onChainLendOffers.filter((o) => o.status === 'matched');
  const allMatchedOffers = [...matchedBorrowOffers, ...matchedLendOffers];

  // 중복 제거 (onChainId 기준)
  const positionMap = new Map<string, Position & { onChainId?: bigint }>();
  allMatchedOffers.forEach((offer) => {
    const position = convertOfferToPosition(offer);
    if (position && position.onChainId) {
      const key = position.onChainId.toString();
      if (!positionMap.has(key)) {
        positionMap.set(key, position);
      }
    }
  });

  const openPositions = Array.from(positionMap.values()).filter((p) => p.status === 'open');

  // 각 포지션의 상태를 추적하기 위한 state
  const [positionStatuses, setPositionStatuses] = useState<
    Record<string, { isLiquidatable: boolean; isAtRisk: boolean }>
  >({});

  // 포지션 상태 변경 핸들러 (useCallback으로 메모이제이션)
  const handlePositionStatusChange = useCallback(
    (positionId: string, isLiquidatable: boolean, isAtRisk: boolean) => {
      setPositionStatuses((prev) => {
        // 이미 같은 값이면 업데이트하지 않음
        if (
          prev[positionId]?.isLiquidatable === isLiquidatable &&
          prev[positionId]?.isAtRisk === isAtRisk
        ) {
          return prev;
        }
        return {
          ...prev,
          [positionId]: { isLiquidatable, isAtRisk },
        };
      });
    },
    [],
  );

  // 위험 포지션과 청산 가능 포지션 카운트 계산
  const atRiskCount = Object.values(positionStatuses).filter((status) => status.isAtRisk).length;
  const liquidatableCount = Object.values(positionStatuses).filter(
    (status) => status.isLiquidatable,
  ).length;

  const [isAuthed, setIsAuthed] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [selectedToken, setSelectedToken] = useState<`0x${string}`>(
    (collateralTokens[0]?.address as `0x${string}`) || '0x',
  );
  const [newPrice, setNewPrice] = useState('');

  const [showTx, setShowTx] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [txHash, setTxHash] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [liquidatingPosition, setLiquidatingPosition] = useState<
    (Position & { onChainId?: bigint }) | null
  >(null);
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);

  // 선택된 토큰 정보
  const selectedTokenInfo = collateralTokens.find((t) => t.address === selectedToken);

  const handleAuth = () => {
    if (authCode === 'admin123') {
      setIsAuthed(true);
    }
  };

  const handleTokenChange = (address: string) => {
    setSelectedToken(address as `0x${string}`);
    const token = collateralTokens.find((t) => t.address === address);
    if (token) {
      setNewPrice((onChainPrices[token.symbol] || 0).toString());
    }
  };

  const generateTxHash = () => {
    const chars = '0123456789abcdef';
    let hash = '0x';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  };

  const handlePriceUpdate = async () => {
    const priceValue = Number.parseFloat(newPrice);
    if (isNaN(priceValue) || priceValue <= 0) return;
    if (!selectedTokenInfo) return;

    setShowTx(true);
    setIsComplete(false);
    setTxError(null);
    setLiquidatingPosition(null);
    setIsUpdatingPrice(true);

    const steps: TxStep[] = [
      { id: 'prepare', label: '트랜잭션 준비', status: 'active' },
      { id: 'tx', label: `${selectedTokenInfo.name} 오라클 가격 업데이트`, status: 'pending' },
      { id: 'confirm', label: '트랜잭션 확인', status: 'pending' },
    ];
    setTxSteps(steps);

    try {
      // 가격을 18 decimals로 변환 (1원 = 1e18 wei 단위)
      const priceInWei = parseUnits(priceValue.toString(), 18);

      // Step 1 완료
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'prepare'
            ? { ...s, status: 'complete' }
            : s.id === 'tx'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // 온체인 트랜잭션 실행
      const hash = await setPrice(selectedToken as `0x${string}`, priceInWei);
      setTxHash(hash);

      // Step 2 완료
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'tx'
            ? { ...s, status: 'complete' }
            : s.id === 'confirm'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // 블록 확정 대기 (폴링이 자동으로 가격 갱신)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Step 3 완료
      setTxSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));
      setIsComplete(true);
    } catch (error) {
      console.error('Price update failed:', error);
      setTxError(error instanceof Error ? error.message : '가격 업데이트 실패');
      setTxSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' as const } : s)),
      );
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const handleLiquidate = async (
    position: Position & { onChainId?: bigint },
    onChainData?: { currentLoanAmount: number; accruedInterest: number; debtValue: number },
  ) => {
    if (!position.onChainId) {
      setTxError('온체인 포지션 ID를 찾을 수 없습니다.');
      return;
    }
    if (!user?.id) {
      setTxError('관리자 계정으로 로그인해야 청산을 진행할 수 있습니다.');
      return;
    }
    const userAddress = getCustodyWalletAddress(user.id);
    if (!userAddress) {
      setTxError('관리자 커스터디 지갑을 찾을 수 없습니다.');
      return;
    }

    const currentLoanAmount = Math.max(onChainData?.currentLoanAmount ?? position.loanAmount, 0);
    const accruedInterest = Math.max(onChainData?.accruedInterest ?? position.accruedInterest, 0);
    const totalDebt = currentLoanAmount + accruedInterest;
    const bufferedDebt = totalDebt * 1.01; // 1% 버퍼
    const repayAmountInWei = parseUnits(bufferedDebt.toFixed(18), 18);

    setShowTx(true);
    setIsComplete(false);
    setTxError(null);
    setLiquidatingPosition(position);

    const steps: TxStep[] = [
      { id: 'calculate', label: '원금+이자 재계산', status: 'active' },
      { id: 'fund', label: '청산자 지갑 가스비 확보', status: 'pending' },
      { id: 'tokenize', label: 'dKRW 토큰화 (원리금+버퍼)', status: 'pending' },
      { id: 'approve', label: 'dKRW 토큰 Approve', status: 'pending' },
      { id: 'liquidate', label: '청산 트랜잭션 실행', status: 'pending' },
      { id: 'legacy', label: '래거시 시스템 이벤트 수신', status: 'pending' },
      { id: 'collateral', label: '담보 토큰 Burn', status: 'pending' },
      { id: 'pledge_release', label: '질권 해제', status: 'pending' },
      { id: 'stock_transfer', label: '담보 주식 매도', status: 'pending' },
      {
        id: 'cash_transfer',
        label: '매도한 주식으로 받은 원화 분배 (청산자, 대출자)',
        status: 'pending',
      },
      { id: 'tx', label: '정산 완료', status: 'pending' },
    ];
    setTxSteps(steps);

    const advanceStep = (currentId: string, nextId?: string) => {
      setTxSteps((prev) =>
        prev.map((s) => {
          if (s.id === currentId) {
            return { ...s, status: 'complete' };
          }
          if (nextId && s.id === nextId) {
            return { ...s, status: 'active' };
          }
          return s;
        }),
      );
    };

    try {
      // Step 1: 가스비 확보
      advanceStep('calculate', 'fund');
      await ensureEthBalance(userAddress);

      // Step 2: 청산 전 Health Factor 확인 (청산 가능 여부 재확인)
      // mint/approve 전에 확인하여 불필요한 트랜잭션 방지
      const currentHealthFactor = await publicClient.readContract({
        address: CONTRACTS.lending,
        abi: lendingAbi,
        functionName: 'currentHealthFactor',
        args: [position.onChainId],
      });
      const hfValue = Number(currentHealthFactor) / 10000; // bps to decimal

      if (hfValue >= 1.0) {
        throw new Error(
          `청산 불가능: 현재 Health Factor가 ${hfValue.toFixed(
            2,
          )}입니다. Health Factor가 1.0 미만일 때만 청산이 가능합니다.`,
        );
      }

      // Step 3: dKRW 토큰화
      advanceStep('fund', 'tokenize');
      await mintTokenByMaster('lend', userAddress, repayAmountInWei);

      // Step 4: Approve
      advanceStep('tokenize', 'approve');
      await approveTokenForLending('lend', repayAmountInWei, user.id);

      // Step 5: 청산 트랜잭션 실행 (원리금 상환 + 담보 청산)
      // approve 직후 바로 청산 호출하여 Health Factor가 변하기 전에 실행
      advanceStep('approve', 'liquidate');
      const hash = await liquidate(position.onChainId, user.id);
      setTxHash(hash);

      // Step 5 이후: 레거시 프로세스 시뮬레이션
      advanceStep('liquidate', 'legacy');
      const postSteps: Array<
        'legacy' | 'collateral' | 'pledge_release' | 'stock_transfer' | 'cash_transfer' | 'tx'
      > = ['legacy', 'collateral', 'pledge_release', 'stock_transfer', 'cash_transfer', 'tx'];
      for (let i = 0; i < postSteps.length; i++) {
        const current = postSteps[i];
        const next = postSteps[i + 1];
        await new Promise((resolve) => setTimeout(resolve, 800));
        advanceStep(current, next);
      }

      updatePosition(position.id, {
        status: 'liquidated',
        loanAmount: 0,
        accruedInterest: 0,
      });

      setIsComplete(true);
    } catch (error) {
      console.error('Liquidation failed:', error);
      setTxError(error instanceof Error ? error.message : '청산 처리에 실패했습니다.');
      setTxSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' as const } : s)),
      );
    }
  };

  const handleCloseTx = () => {
    setShowTx(false);
    setTxSteps([]);
    setTxHash('');
    setIsComplete(false);
    setTxError(null);
    setLiquidatingPosition(null);
  };

  if (!isAuthed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Admin Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAuth();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>인증 코드</Label>
                <Input
                  type="password"
                  placeholder="인증 코드를 입력하세요"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full">
                <Unlock className="mr-2 h-4 w-4" />
                접속하기
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground">
              테스트용 인증 코드: admin123
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive">
              <Shield className="h-4 w-4 text-destructive-foreground" />
            </div>
            <span className="text-lg font-semibold">Admin Panel</span>
          </div>
          <Badge variant="outline" className="gap-1">
            <div className="h-2 w-2 rounded-full bg-primary" />
            Connected
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">활성 포지션</p>
                  <p className="text-2xl font-bold">{openPositions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20 text-warning">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">위험 포지션</p>
                  <p className="text-2xl font-bold">{atRiskCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">청산 가능 포지션</p>
                  <p className="text-2xl font-bold">{liquidatableCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <TrendingDown className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">대기중인 대출/대여 상품 수</p>
                  <p className="text-2xl font-bold">
                    {onChainBorrowOffers.filter((o) => o.status === 'active').length} /{' '}
                    {onChainLendOffers.filter((o) => o.status === 'active').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                오라클 가격 관리 (온체인)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>담보 토큰 선택</Label>
                  <Select value={selectedToken} onValueChange={handleTokenChange}>
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {collateralTokens.map((token) => (
                        <SelectItem key={token.address} value={token.address}>
                          <div className="flex items-center gap-2">
                            <span>{token.icon}</span>
                            <span>{token.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>새 가격 (KRW)</Label>
                  <Input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-48"
                    placeholder="예: 45000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>현재 온체인 가격</Label>
                  <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3">
                    <span className="font-mono">
                      ₩
                      {selectedTokenInfo
                        ? (onChainPrices[selectedTokenInfo.symbol] || 0).toLocaleString()
                        : 0}
                    </span>
                  </div>
                </div>
                <Button onClick={handlePriceUpdate} disabled={isUpdatingPrice || !selectedToken}>
                  {isUpdatingPrice ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  가격 업데이트
                </Button>
              </div>

              <div className="mt-4 rounded-lg bg-secondary/50 p-3">
                <p className="text-sm font-medium mb-2">전체 담보 가격 현황 (온체인)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {collateralTokens.map((token) => (
                    <div key={token.address} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{token.icon}</span>
                        <span>{token.name}</span>
                        <span className="text-xs text-muted-foreground">({token.symbol})</span>
                      </span>
                      <span className="font-mono">
                        ₩
                        {(
                          onChainPrices[token.symbol] ||
                          onChainPrices[token.address.toLowerCase()] ||
                          0
                        ).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                마지막 조회: {new Date(onChainPrices.lastUpdated).toLocaleString('ko-KR')}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="contract-data">
          <TabsList className="mb-6">
            <TabsTrigger value="contract-data" className="gap-2">
              <Database className="h-4 w-4" />
              컨트랙트 데이터
            </TabsTrigger>
            <TabsTrigger value="positions">활성 포지션 관리 ({openPositions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="contract-data">
            <ContractDataSection />
          </TabsContent>

          <TabsContent value="positions">
            {openPositions.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground">활성 포지션이 없습니다</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {openPositions.map((position) => (
                  <OnChainPositionCard
                    key={position.id}
                    position={position}
                    onLiquidate={handleLiquidate}
                    onStatusChange={handlePositionStatusChange}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <TransactionModal
        open={showTx}
        onClose={handleCloseTx}
        title={liquidatingPosition ? '청산 진행' : '오라클 업데이트'}
        steps={txSteps}
        txHash={txHash}
        isComplete={isComplete}
        error={txError}
      />
    </div>
  );
}
