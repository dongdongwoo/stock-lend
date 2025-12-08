'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStore, type BorrowOffer, type LendOffer } from '@/lib/store';
import { PositionCard } from '@/components/position-card';
import { LoginModal } from '@/components/login-modal';
import { BuyAssetsModal } from '@/components/buy-assets-modal';
import { EditOfferModal } from '@/components/edit-offer-modal';
import { CancelOfferModal } from '@/components/cancel-offer-modal';
import { AddCollateralModal } from '@/components/add-collateral-modal';
import { RepayModal } from '@/components/repay-modal';
import {
  Wallet,
  Briefcase,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useOraclePricesWagmi,
  useUserBorrowPositions,
  useUserLendPositions,
  useLenderLoanPositions,
  useBorrowerLendPositions,
  useBorrowOffersWagmi,
  useLendOffersWagmi,
  useAllowedCollateralTokensWagmi,
  useUserLiquidations,
  useCategoriesWagmi,
  useMultiplePositionsDataWagmi,
  type UIBorrowOffer,
  type UILendOffer,
} from '@/lib/hooks';
import { mapCollateralTokens, CONTRACTS } from '@/lib/contracts/config';
import { useReadContracts } from 'wagmi';
import { lendingConfigAbi } from '@/lib/contracts/abis/lendingConfig';
import { getCustodyWalletAddress } from '@/lib/wallet/custody';
import { OfferState } from '@/lib/contracts/lending';
import { TokenIcon } from '@/components/token-icon';

// 종목군 ID를 문자로 변환 (1 -> A, 2 -> B, 3 -> C, ...)
function categoryIdToLetter(categoryId: bigint | undefined | null): string {
  if (categoryId === undefined || categoryId === null) {
    return 'N/A';
  }
  const num = Number(categoryId);
  if (num <= 0) return 'N/A';
  // 1 -> A, 2 -> B, 3 -> C, ...
  return String.fromCharCode(64 + num); // 65는 'A'의 ASCII 코드
}
import type { Position } from '@/lib/store';

// 포지션의 고유 키 생성 (담보/대출금액/이자율/만기일 조합)
function getPositionKey(position: UIBorrowOffer | UILendOffer): string {
  const collateralStock =
    'collateralStock' in position ? position.collateralStock : position.requestedCollateralStock;
  return `${collateralStock}-${position.collateralAmount}-${position.loanAmount}-${position.interestRate}-${position.maturityDays}`;
}

// 온체인 데이터를 Position 타입으로 변환하는 헬퍼 함수
// Health Factor와 Accrued Interest는 PositionCard에서 온체인에서 직접 조회
function convertToPosition(
  offer: UIBorrowOffer | UILendOffer,
  user: { id: string } | null,
  walletAddress: string | null,
): Position | null {
  if (!user || !walletAddress) return null;

  const isBorrowOffer = 'collateralStock' in offer;
  const borrowOffer = offer as UIBorrowOffer;
  const lendOffer = offer as UILendOffer;

  // borrowerId와 lenderId는 주소를 그대로 사용 (PositionCard에서 walletAddress와 비교)
  const borrowerId = isBorrowOffer
    ? borrowOffer.borrower.toLowerCase()
    : lendOffer.borrower?.toLowerCase() || walletAddress;
  const lenderId = isBorrowOffer
    ? borrowOffer.lender?.toLowerCase() || walletAddress
    : lendOffer.lender.toLowerCase();

  // 실제 사용자가 borrower인지 lender인지 확인
  const isUserBorrower = borrowerId === walletAddress.toLowerCase();
  const isUserLender = lenderId === walletAddress.toLowerCase();

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
  if (offer.status === 'closed') status = 'closed';
  else if (offer.status === 'liquidated') status = 'liquidated';
  else if (offer.status === 'matched') status = 'open';

  // Health Factor와 Accrued Interest는 PositionCard에서 온체인에서 직접 조회
  // 여기서는 기본값만 설정 (0이면 PositionCard에서 온체인 데이터로 업데이트)
  const accruedInterest = 0;
  const healthFactor = 0;

  // liquidationPrice는 PositionCard에서 온체인 데이터로 계산되므로
  // 여기서는 기본값만 설정 (0이면 PositionCard에서 온체인 데이터로 업데이트)
  const liquidationPrice = 0;

  // type 결정: 사용자가 borrower이면 'borrow', lender이면 'lend'
  // 이자와 HF 조회를 위해 borrower인 경우 'borrow'로 설정
  const positionType: 'borrow' | 'lend' = isUserBorrower ? 'borrow' : 'lend';

  return {
    id: offer.id,
    type: positionType,
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
    // 온체인 ID 저장 (PositionCard에서 Health Factor와 Accrued Interest 조회용)
    onChainId: offer.onChainId,
  } as Position & { onChainId?: bigint };
}

export default function PortfolioPage() {
  const { user, oraclePrice } = useStore();

  // 온체인 데이터 조회
  const { prices: onChainPrices } = useOraclePricesWagmi();
  const { categories } = useCategoriesWagmi();

  // 각 카테고리 ID에 대해 getCategoryTokens() 호출 (포트폴리오 표시용)
  const categoryTokensContracts = categories.map((category) => ({
    address: CONTRACTS.lendingConfig as `0x${string}`,
    abi: lendingConfigAbi,
    functionName: 'getCategoryTokens' as const,
    args: [category.id] as const,
  }));

  const { data: categoryTokensData, isLoading: isLoadingCategoryTokens } = useReadContracts({
    contracts: categoryTokensContracts,
    query: {
      enabled: categories.length > 0,
      refetchInterval: 30000,
      staleTime: 10000,
    },
  });

  // 모든 카테고리의 토큰 주소를 하나의 배열로 합치기 (중복 제거)
  const allTokenAddressesSet = new Set<`0x${string}`>();

  if (categoryTokensData) {
    categoryTokensData.forEach((result) => {
      if (result.status === 'success' && result.result) {
        const tokenAddresses = result.result as `0x${string}`[];
        if (Array.isArray(tokenAddresses)) {
          tokenAddresses.forEach((addr) => {
            allTokenAddressesSet.add(addr);
          });
        }
      }
    });
  }

  // 온체인 오퍼/포지션용 (기존 유지)
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  // allCollateralTokens: categories에서 가져온 토큰이 있으면 사용, 없으면 fallback으로 allowedCollateralTokens 사용
  const allCollateralTokens =
    allTokenAddressesSet.size > 0
      ? mapCollateralTokens(Array.from(allTokenAddressesSet))
      : collateralTokens;

  const walletAddress = user ? getCustodyWalletAddress(user.id)?.toLowerCase() : null;

  // 내 대출/대여 오퍼 및 포지션 조회
  const { offers: allBorrowOffers } = useBorrowOffersWagmi();
  const { offers: allLendOffers } = useLendOffersWagmi();
  const { positions: myBorrowPositions } = useUserBorrowPositions(OfferState.None);
  const { positions: myLendPositions } = useUserLendPositions(OfferState.None);
  // 내가 lender로서 대출 상품에 매칭한 경우
  const { positions: lenderLoanPositions } = useLenderLoanPositions(OfferState.None);
  // 내가 borrower로서 대여 상품에 매칭한 경우
  const { positions: borrowerLendPositions } = useBorrowerLendPositions(OfferState.None);

  // 청산 히스토리 조회
  const { liquidations: userLiquidations } = useUserLiquidations();

  // 내 오퍼 필터링
  const myBorrowOffers = walletAddress
    ? allBorrowOffers.filter(
        (o) => o.borrower.toLowerCase() === walletAddress && o.status === 'active',
      )
    : [];
  const myLendOffers = walletAddress
    ? allLendOffers.filter((o) => o.lender.toLowerCase() === walletAddress && o.status === 'active')
    : [];

  // 내 포지션 필터링 및 중복 제거
  // 대출 탭: useUserBorrowPositions + useBorrowerLendPositions (borrower로서)
  // 대여 탭: useUserLendPositions + useLenderLoanPositions (lender로서)
  // 중요: 같은 포지션이 다른 onChainId로 올 수 있으므로 borrower/lender 주소 + 담보/대출금액/이자율/만기일로 식별

  // 포지션의 실제 고유 키 생성 (onChainId 우선, 없으면 borrower/lender 주소 + 담보/대출금액/이자율/만기일)
  function getUniquePositionKey(position: UIBorrowOffer | UILendOffer, walletAddr: string): string {
    // onChainId가 있으면 그것을 고유 키로 사용 (가장 확실한 방법)
    if (position.onChainId !== undefined && position.onChainId !== null) {
      return `onchain-${position.onChainId.toString()}`;
    }

    const isBorrowOffer = 'collateralStock' in position;
    const borrowOffer = position as UIBorrowOffer;
    const lendOffer = position as UILendOffer;

    const borrowerAddr = isBorrowOffer
      ? borrowOffer.borrower.toLowerCase()
      : lendOffer.borrower?.toLowerCase() || walletAddr;
    const lenderAddr = isBorrowOffer
      ? borrowOffer.lender?.toLowerCase() || walletAddr
      : lendOffer.lender.toLowerCase();

    const collateralStock = isBorrowOffer
      ? borrowOffer.collateralStock
      : lendOffer.requestedCollateralStock;

    // borrower와 lender 주소 + 포지션 정보로 고유 키 생성
    return `${borrowerAddr}-${lenderAddr}-${collateralStock}-${position.collateralAmount}-${position.loanAmount}-${position.interestRate}-${position.maturityDays}`;
  }

  let borrowerPositions: (UIBorrowOffer | UILendOffer)[] = [];
  let lenderPositions: (UIBorrowOffer | UILendOffer)[] = [];

  if (walletAddress) {
    const walletAddr = walletAddress.toLowerCase();

    // 1단계: 모든 포지션을 onChainId 기준으로 먼저 중복 제거 (전역 중복 제거)
    // 매칭된 거래는 하나의 포지션으로 처리: BorrowOffer의 onChainId와 LendOffer의 borrowOfferId가 같으면 같은 포지션
    const allPositionsMap = new Map<string, UIBorrowOffer | UILendOffer>();
    const processedBorrowOfferIds = new Set<string>(); // 처리된 BorrowOffer의 onChainId 추적

    // 먼저 BorrowOffer를 처리
    const borrowOffers = [...myBorrowPositions, ...lenderLoanPositions].filter(
      (p) => 'collateralStock' in p,
    ) as UIBorrowOffer[];

    borrowOffers.forEach((position) => {
      if (position.onChainId !== undefined && position.onChainId !== null) {
        const idKey = position.onChainId.toString();
        if (!allPositionsMap.has(idKey)) {
          allPositionsMap.set(idKey, position);
          processedBorrowOfferIds.add(idKey);
        }
      } else {
        // onChainId가 없으면 고유 키로 추가
        const key = getUniquePositionKey(position, walletAddr);
        if (!allPositionsMap.has(key)) {
          allPositionsMap.set(key, position);
        }
      }
    });

    // 그 다음 LendOffer를 처리하되, borrowOfferId가 이미 처리된 BorrowOffer의 onChainId와 같으면 제외
    const lendOffers = [
      ...borrowerLendPositions,
      ...myLendPositions,
      ...lenderLoanPositions,
    ].filter((p) => !('collateralStock' in p)) as UILendOffer[];

    lendOffers.forEach((position) => {
      // borrowOfferId가 있으면 이미 BorrowOffer로 처리된 포지션이므로 제외
      if (position.borrowOfferId && position.borrowOfferId > BigInt(0)) {
        const borrowOfferKey = position.borrowOfferId.toString();
        // 이미 BorrowOffer로 처리된 포지션이 있으면 제외
        if (processedBorrowOfferIds.has(borrowOfferKey)) {
          return; // 이미 처리된 포지션이므로 제외
        }
      }

      // borrowOfferId가 없거나, 해당 BorrowOffer가 없는 경우에만 포지션으로 추가
      if (position.onChainId !== undefined && position.onChainId !== null) {
        const idKey = position.onChainId.toString();
        if (!allPositionsMap.has(idKey)) {
          allPositionsMap.set(idKey, position);
        }
      } else {
        // onChainId가 없으면 고유 키로 추가
        const key = getUniquePositionKey(position, walletAddr);
        if (!allPositionsMap.has(key)) {
          allPositionsMap.set(key, position);
        }
      }
    });

    // 2단계: 중복 제거된 포지션들을 borrower/lender 기준으로 분류
    const uniquePositions = Array.from(allPositionsMap.values());

    borrowerPositions = uniquePositions.filter((position) => {
      const isBorrowOffer = 'collateralStock' in position;
      const borrowOffer = position as UIBorrowOffer;
      const lendOffer = position as UILendOffer;
      const borrowerAddr = isBorrowOffer
        ? borrowOffer.borrower.toLowerCase()
        : lendOffer.borrower?.toLowerCase() || walletAddr;
      return borrowerAddr === walletAddr;
    });

    lenderPositions = uniquePositions.filter((position) => {
      const isBorrowOffer = 'collateralStock' in position;
      const borrowOffer = position as UIBorrowOffer;
      const lendOffer = position as UILendOffer;
      const lenderAddr = isBorrowOffer
        ? borrowOffer.lender?.toLowerCase() || walletAddr
        : lendOffer.lender.toLowerCase();
      return lenderAddr === walletAddr;
    });
  }

  // 상태별 필터링
  const matchedBorrowPositions = borrowerPositions.filter((p) => p.status === 'matched');
  const closedBorrowPositions = borrowerPositions.filter((p) => p.status === 'closed');
  const liquidatedBorrowPositions = borrowerPositions.filter((p) => p.status === 'liquidated');

  const matchedLendPositions = lenderPositions.filter((p) => p.status === 'matched');
  const closedLendPositions = lenderPositions.filter((p) => p.status === 'closed');

  // 모든 매칭된 포지션의 onChainId 수집 (multicall로 한 번에 조회)
  const allMatchedPositions = [...matchedBorrowPositions, ...matchedLendPositions];
  const allPositionOnChainIds = allMatchedPositions
    .map((p) => p.onChainId)
    .filter((id): id is bigint => id !== null && id !== undefined);

  // 여러 포지션의 Health Factor와 Accrued Interest를 한 번에 조회 (multicall 사용)
  const { positionsData: allPositionsData } = useMultiplePositionsDataWagmi(allPositionOnChainIds);

  const [showLogin, setShowLogin] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [editBorrowOfferId, setEditBorrowOfferId] = useState<string | null>(null);
  const [editLendOfferId, setEditLendOfferId] = useState<string | null>(null);
  const [cancelBorrowOfferId, setCancelBorrowOfferId] = useState<string | null>(null);
  const [cancelLendOfferId, setCancelLendOfferId] = useState<string | null>(null);
  const [addCollateralPosition, setAddCollateralPosition] = useState<Position | null>(null);
  const [repayPosition, setRepayPosition] = useState<Position | null>(null);

  // ID를 기반으로 최신 offer 찾기 (컨트랙트 데이터 업데이트 시 자동 동기화)
  const editBorrowOffer = useMemo(() => {
    if (!editBorrowOfferId) return null;
    return allBorrowOffers.find((o) => o.id === editBorrowOfferId) || null;
  }, [editBorrowOfferId, allBorrowOffers]);

  const editLendOffer = useMemo(() => {
    if (!editLendOfferId) return null;
    return allLendOffers.find((o) => o.id === editLendOfferId) || null;
  }, [editLendOfferId, allLendOffers]);

  const cancelBorrowOffer = useMemo(() => {
    if (!cancelBorrowOfferId) return null;
    const offer = allBorrowOffers.find((o) => o.id === cancelBorrowOfferId);
    if (!offer) return null;
    // UIBorrowOffer를 BorrowOffer 형태로 변환 (CancelOfferModal이 기대하는 형태)
    return {
      id: offer.id,
      borrowerId: offer.borrower,
      collateralStock: offer.collateralStock,
      collateralAmount: offer.collateralAmount,
      loanCurrency: offer.loanCurrency,
      loanAmount: offer.loanAmount,
      interestRate: offer.interestRate,
      maturityDays: offer.maturityDays,
      ltv: offer.ltv || 0,
      status: offer.status,
      createdAt: offer.createdAt,
    } as BorrowOffer;
  }, [cancelBorrowOfferId, allBorrowOffers]);

  const cancelLendOffer = useMemo(() => {
    if (!cancelLendOfferId) return null;
    const offer = allLendOffers.find((o) => o.id === cancelLendOfferId);
    if (!offer) return null;
    // UILendOffer를 LendOffer 형태로 변환 (CancelOfferModal이 기대하는 형태)
    return {
      id: offer.id,
      lenderId: offer.lender,
      loanCurrency: offer.loanCurrency,
      loanAmount: offer.loanAmount,
      requestedCollateralStock: offer.requestedCollateralStock,
      interestRate: offer.interestRate,
      maturityDays: offer.maturityDays,
      status: offer.status,
      createdAt: offer.createdAt,
    } as LendOffer;
  }, [cancelLendOfferId, allLendOffers]);

  // 주식 평가액 계산 (온체인 가격 × 클라이언트 단 보유 주식) - 온체인에서 가져온 모든 토큰 사용
  const totalStockValue = user
    ? allCollateralTokens.reduce((acc, token) => {
        const quantity = user.stocks?.[token.symbol] || 0;
        const addressLower = token.address.toLowerCase();
        // 여러 방법으로 가격 조회 시도
        const price =
          onChainPrices[token.symbol] ||
          onChainPrices[addressLower] ||
          onChainPrices[token.address] ||
          0;

        // 디버깅: 가격이 0인 경우 로그
        if (quantity > 0 && price === 0) {
          console.warn(`Portfolio: Price is 0 for ${token.symbol} (${addressLower})`, {
            symbol: token.symbol,
            address: token.address,
            addressLower,
            availablePrices: Object.keys(onChainPrices).filter(
              (k) => k.toLowerCase() === addressLower || k === token.symbol,
            ),
            onChainPricesKeys: Object.keys(onChainPrices),
          });
        }

        return acc + quantity * price;
      }, 0)
    : 0;

  // 디버깅: 전체 상태 확인
  if (user) {
    console.log('Portfolio totalStockValue calculation:', {
      allCollateralTokensCount: allCollateralTokens.length,
      allCollateralTokens: allCollateralTokens.map((t) => ({
        symbol: t.symbol,
        address: t.address.toLowerCase(),
        quantity: user.stocks?.[t.symbol] || 0,
        price: onChainPrices[t.symbol] || onChainPrices[t.address.toLowerCase()] || 0,
      })),
      onChainPricesKeys: Object.keys(onChainPrices),
      totalStockValue,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Portfolio</h1>
          <p className="text-muted-foreground">내 자산 및 포지션 현황을 확인하세요</p>
        </div>

        {!user ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wallet className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">계정을 연결해주세요</p>
              <p className="mb-4 text-muted-foreground">
                포트폴리오를 확인하려면 먼저 계정을 연결해야 합니다
              </p>
              <Button onClick={() => setShowLogin(true)}>계정 연결</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-6">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">내 자산</h3>
                  <Button variant="outline" size="sm" onClick={() => setShowBuy(true)}>
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    테스트 자산 구매
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* 현금 */}
                  <div className="rounded-lg bg-secondary p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-5 w-5 text-primary" />
                      <span className="text-sm text-muted-foreground">보유 현금</span>
                    </div>
                    <p className="text-2xl font-bold">₩{(user?.cash || 0).toLocaleString()}</p>
                  </div>

                  {/* 주식 총 가치 */}
                  <div className="rounded-lg bg-secondary p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <span className="text-sm text-muted-foreground">주식 평가액</span>
                    </div>
                    <p className="text-2xl font-bold">₩{(totalStockValue || 0).toLocaleString()}</p>
                  </div>
                </div>

                {/* 주식 보유 현황 (config에 정의된 모든 토큰 표시) */}
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">보유 주식</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {allCollateralTokens.map((token) => {
                      const quantity = user?.stocks?.[token.symbol] || 0;
                      const addressLower = token.address.toLowerCase();
                      // 여러 방법으로 가격 조회 시도
                      const price =
                        onChainPrices[token.symbol] ||
                        onChainPrices[addressLower] ||
                        onChainPrices[token.address] ||
                        0;
                      const value = quantity * price;
                      // 보유 수량이 0이어도 표시 (가격 정보 확인용)
                      return (
                        <div
                          key={token.address}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-2">
                            <TokenIcon icon={token.icon} name={token.name} size={20} />
                            <div>
                              <p className="text-sm font-medium">{token.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {quantity.toLocaleString()}주
                              </p>
                            </div>
                          </div>
                          <p className="text-sm font-medium">₩{value.toLocaleString()}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="borrows">
              <TabsList className="mb-6">
                <TabsTrigger value="borrows" className="gap-2">
                  <TrendingDown className="h-4 w-4" />내 대출 (
                  {myBorrowOffers.length + matchedBorrowPositions.length})
                </TabsTrigger>
                <TabsTrigger value="lends" className="gap-2">
                  <TrendingUp className="h-4 w-4" />내 대여 (
                  {myLendOffers.length + matchedLendPositions.length})
                </TabsTrigger>
                <TabsTrigger value="liquidations" className="gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  청산 히스토리 ({userLiquidations.length})
                </TabsTrigger>
              </TabsList>

              {/* 내 대출 탭 */}
              <TabsContent value="borrows">
                <Tabs defaultValue="active">
                  <TabsList className="mb-4">
                    <TabsTrigger value="active">대기중 ({myBorrowOffers.length})</TabsTrigger>
                    <TabsTrigger value="matched">
                      매칭됨 ({matchedBorrowPositions.length})
                    </TabsTrigger>
                    <TabsTrigger value="closed">
                      종료됨 ({closedBorrowPositions.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="active">
                    {myBorrowOffers.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <Briefcase className="mb-4 h-12 w-12 text-muted-foreground" />
                          <p className="text-muted-foreground">대기중인 대출 상품이 없습니다</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {myBorrowOffers.map((offer) => {
                          const token = collateralTokens.find(
                            (t) => t.symbol === offer.collateralStock,
                          );
                          return (
                            <Card key={offer.id}>
                              <CardContent className="p-4">
                                <div className="mb-3 flex items-center justify-between">
                                  <Badge variant="outline">대기중</Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {new Date(offer.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">담보</span>
                                    <span className="font-medium">
                                      {offer.collateralAmount.toLocaleString()}주 {token?.name}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">대출 희망</span>
                                    <span className="font-medium">
                                      ₩{offer.loanAmount.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">이자율</span>
                                    <span className="font-medium">{offer.interestRate}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">만기</span>
                                    <span className="font-medium">{offer.maturityDays}일</span>
                                  </div>
                                </div>
                                <div className="mt-4 flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 bg-transparent"
                                    onClick={() => setEditBorrowOfferId(offer.id)}
                                  >
                                    수정
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setCancelBorrowOfferId(offer.id)}
                                  >
                                    취소
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="matched">
                    {matchedBorrowPositions.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <p className="text-muted-foreground">매칭된 대출 포지션이 없습니다</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {matchedBorrowPositions
                          .map((pos) => convertToPosition(pos, user, walletAddress || null))
                          .filter((pos): pos is Position => pos !== null)
                          .map((position) => (
                            <PositionCard
                              key={
                                (
                                  position as Position & { onChainId?: bigint }
                                ).onChainId?.toString() || position.id
                              }
                              position={position}
                              walletAddress={walletAddress || null}
                              onAddCollateral={() => setAddCollateralPosition(position)}
                              onRepay={() => setRepayPosition(position)}
                              preloadedData={
                                (position as Position & { onChainId?: bigint }).onChainId
                                  ? allPositionsData.get(
                                      (position as Position & { onChainId?: bigint }).onChainId!,
                                    )
                                  : undefined
                              }
                            />
                          ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="closed">
                    {closedBorrowPositions.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <p className="text-muted-foreground">종료된 대출 포지션이 없습니다</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {closedBorrowPositions
                          .map((pos) => convertToPosition(pos, user, walletAddress || null))
                          .filter((pos): pos is Position => pos !== null)
                          .map((position) => (
                            <PositionCard
                              key={
                                (
                                  position as Position & { onChainId?: bigint }
                                ).onChainId?.toString() || position.id
                              }
                              position={position}
                              walletAddress={walletAddress || null}
                              showActions={false}
                              preloadedData={
                                (position as Position & { onChainId?: bigint }).onChainId
                                  ? allPositionsData.get(
                                      (position as Position & { onChainId?: bigint }).onChainId!,
                                    )
                                  : undefined
                              }
                            />
                          ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* 내 대여 탭 */}
              <TabsContent value="lends">
                <Tabs defaultValue="active">
                  <TabsList className="mb-4">
                    <TabsTrigger value="active">대기중 ({myLendOffers.length})</TabsTrigger>
                    <TabsTrigger value="matched">
                      매칭됨 ({matchedLendPositions.length})
                    </TabsTrigger>
                    <TabsTrigger value="closed">종료됨 ({closedLendPositions.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="active">
                    {myLendOffers.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <Briefcase className="mb-4 h-12 w-12 text-muted-foreground" />
                          <p className="text-muted-foreground">대기중인 대여 상품이 없습니다</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {myLendOffers.map((offer) => {
                          return (
                            <Card key={offer.id}>
                              <CardContent className="p-4">
                                <div className="mb-3 flex items-center justify-between">
                                  <Badge variant="outline">대기중</Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {new Date(offer.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">대여 금액</span>
                                    <span className="font-medium">
                                      ₩{offer.loanAmount.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">허용 담보 종목군</span>
                                    <span className="font-medium font-mono">
                                      {categoryIdToLetter(offer.categoryId)}군
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">이자율</span>
                                    <span className="font-medium">{offer.interestRate}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">만기</span>
                                    <span className="font-medium">{offer.maturityDays}일</span>
                                  </div>
                                </div>
                                <div className="mt-4 flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 bg-transparent"
                                    onClick={() => setEditLendOfferId(offer.id)}
                                  >
                                    수정
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setCancelLendOfferId(offer.id)}
                                  >
                                    취소
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="matched">
                    {matchedLendPositions.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <p className="text-muted-foreground">매칭된 대여 포지션이 없습니다</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {matchedLendPositions
                          .map((pos) => convertToPosition(pos, user, walletAddress || null))
                          .filter((pos): pos is Position => pos !== null)
                          .map((position) => (
                            <PositionCard
                              key={
                                (
                                  position as Position & { onChainId?: bigint }
                                ).onChainId?.toString() || position.id
                              }
                              position={position}
                              walletAddress={walletAddress || null}
                              preloadedData={
                                (position as Position & { onChainId?: bigint }).onChainId
                                  ? allPositionsData.get(
                                      (position as Position & { onChainId?: bigint }).onChainId!,
                                    )
                                  : undefined
                              }
                            />
                          ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="closed">
                    {closedLendPositions.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <p className="text-muted-foreground">종료된 대여 포지션이 없습니다</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {closedLendPositions
                          .map((pos) => convertToPosition(pos, user, walletAddress || null))
                          .filter((pos): pos is Position => pos !== null)
                          .map((position) => (
                            <PositionCard
                              key={
                                (
                                  position as Position & { onChainId?: bigint }
                                ).onChainId?.toString() || position.id
                              }
                              position={position}
                              walletAddress={walletAddress || null}
                              showActions={false}
                              preloadedData={
                                (position as Position & { onChainId?: bigint }).onChainId
                                  ? allPositionsData.get(
                                      (position as Position & { onChainId?: bigint }).onChainId!,
                                    )
                                  : undefined
                              }
                            />
                          ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* 청산 히스토리 탭 */}
              <TabsContent value="liquidations">
                {userLiquidations.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <AlertTriangle className="mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-lg font-medium">청산 내역이 없습니다</p>
                      <p className="text-muted-foreground">청산된 포지션이 없습니다</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {userLiquidations.map((liquidation) => {
                      const token = collateralTokens.find(
                        (t) => t.symbol === liquidation.collateralStock,
                      );
                      const isBorrower =
                        walletAddress &&
                        liquidation.borrower &&
                        liquidation.borrower.toLowerCase() === walletAddress;
                      return (
                        <Card
                          key={liquidation.borrowOfferId.toString()}
                          className="border-red-500/30 bg-red-500/5"
                        >
                          <CardContent className="p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <Badge variant="destructive">청산됨</Badge>
                              <span className="text-sm text-muted-foreground">
                                {isBorrower ? '대출자' : '대여자'}
                              </span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">청산 일시</span>
                                <span className="text-sm font-medium">
                                  {new Date(liquidation.liquidatedAt).toLocaleString('ko-KR')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">담보</span>
                                <span className="font-medium">{token?.name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">대출금</span>
                                <span className="font-medium">
                                  ₩{liquidation.loanAmount.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  상환된 부채 (이자 포함)
                                </span>
                                <span className="font-medium">
                                  ₩{liquidation.debtRepaid.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  청산자에게 인계된 담보
                                </span>
                                <span className="font-medium">
                                  {liquidation.collateralSeized.toLocaleString()}주
                                </span>
                              </div>
                              {liquidation.collateralReturned > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">반환된 담보</span>
                                  <span className="font-medium text-green-600">
                                    {liquidation.collateralReturned.toLocaleString()}주
                                  </span>
                                </div>
                              )}
                              <div className="mt-2 border-t pt-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>청산자</span>
                                  <span className="font-mono">
                                    {liquidation.liquidator.slice(0, 6)}...
                                    {liquidation.liquidator.slice(-4)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
      <BuyAssetsModal open={showBuy} onClose={() => setShowBuy(false)} />
      <EditOfferModal
        open={!!editBorrowOffer}
        onClose={() => setEditBorrowOfferId(null)}
        offer={editBorrowOffer}
        type="borrow"
      />
      <EditOfferModal
        open={!!editLendOffer}
        onClose={() => setEditLendOfferId(null)}
        offer={editLendOffer}
        type="lend"
      />
      <CancelOfferModal
        open={!!cancelBorrowOffer}
        onClose={() => setCancelBorrowOfferId(null)}
        offer={cancelBorrowOffer}
        type="borrow"
      />
      <CancelOfferModal
        open={!!cancelLendOffer}
        onClose={() => setCancelLendOfferId(null)}
        offer={cancelLendOffer}
        type="lend"
      />
      <AddCollateralModal
        open={!!addCollateralPosition}
        onClose={() => setAddCollateralPosition(null)}
        position={addCollateralPosition}
      />
      <RepayModal
        open={!!repayPosition}
        onClose={() => setRepayPosition(null)}
        position={repayPosition}
      />
    </div>
  );
}
