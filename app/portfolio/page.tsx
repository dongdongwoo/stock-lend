'use client';

import { useState } from 'react';
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
  type UIBorrowOffer,
  type UILendOffer,
} from '@/lib/hooks';
import { mapCollateralTokens } from '@/lib/contracts/config';
import { getCustodyWalletAddress } from '@/lib/wallet/custody';
import { OfferState } from '@/lib/contracts/lending';
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
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);
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

  // 포지션의 실제 고유 키 생성 (borrower/lender 주소 + 담보/대출금액/이자율/만기일)
  function getUniquePositionKey(position: UIBorrowOffer | UILendOffer, walletAddr: string): string {
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

    // 대출 포지션: borrower로서의 포지션만 (고유 키 기준 중복 제거, UIBorrowOffer 우선)
    const borrowerPositionsMap = new Map<string, UIBorrowOffer | UILendOffer>();
    [...myBorrowPositions, ...borrowerLendPositions]
      .filter((position) => {
        // borrower인지 확인
        const isBorrowOffer = 'collateralStock' in position;
        const borrowOffer = position as UIBorrowOffer;
        const lendOffer = position as UILendOffer;
        const borrowerAddr = isBorrowOffer
          ? borrowOffer.borrower.toLowerCase()
          : lendOffer.borrower?.toLowerCase() || walletAddr;
        return borrowerAddr === walletAddr;
      })
      .forEach((position) => {
        const key = getUniquePositionKey(position, walletAddr);
        if (!borrowerPositionsMap.has(key)) {
          borrowerPositionsMap.set(key, position);
        } else {
          // UIBorrowOffer가 우선 (더 많은 정보 포함, onChainId가 Borrow Offer ID)
          const existing = borrowerPositionsMap.get(key)!;
          const isCurrentBorrowOffer = 'collateralStock' in position;
          const isExistingBorrowOffer = 'collateralStock' in existing;
          if (isCurrentBorrowOffer && !isExistingBorrowOffer) {
            borrowerPositionsMap.set(key, position);
          }
        }
      });
    borrowerPositions = Array.from(borrowerPositionsMap.values());

    // 대여 포지션: lender로서의 포지션만 (고유 키 기준 중복 제거)
    const lenderPositionsMap = new Map<string, UIBorrowOffer | UILendOffer>();
    [...myLendPositions, ...lenderLoanPositions]
      .filter((position) => {
        // lender인지 확인
        const isBorrowOffer = 'collateralStock' in position;
        const borrowOffer = position as UIBorrowOffer;
        const lendOffer = position as UILendOffer;
        const lenderAddr = isBorrowOffer
          ? borrowOffer.lender?.toLowerCase() || walletAddr
          : lendOffer.lender.toLowerCase();
        return lenderAddr === walletAddr;
      })
      .forEach((position) => {
        const key = getUniquePositionKey(position, walletAddr);
        if (!lenderPositionsMap.has(key)) {
          lenderPositionsMap.set(key, position);
        } else {
          // UIBorrowOffer가 우선 (더 많은 정보 포함)
          const existing = lenderPositionsMap.get(key)!;
          const isCurrentBorrowOffer = 'collateralStock' in position;
          const isExistingBorrowOffer = 'collateralStock' in existing;
          if (isCurrentBorrowOffer && !isExistingBorrowOffer) {
            lenderPositionsMap.set(key, position);
          }
        }
      });
    lenderPositions = Array.from(lenderPositionsMap.values());
  }

  // 상태별 필터링
  const matchedBorrowPositions = borrowerPositions.filter((p) => p.status === 'matched');
  const closedBorrowPositions = borrowerPositions.filter((p) => p.status === 'closed');
  const liquidatedBorrowPositions = borrowerPositions.filter((p) => p.status === 'liquidated');

  const matchedLendPositions = lenderPositions.filter((p) => p.status === 'matched');
  const closedLendPositions = lenderPositions.filter((p) => p.status === 'closed');

  // 모든 청산된 포지션 (대출자/대여자 모두)
  const liquidatedPositions = [...liquidatedBorrowPositions];
  const [showLogin, setShowLogin] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [editBorrowOffer, setEditBorrowOffer] = useState<BorrowOffer | null>(null);
  const [editLendOffer, setEditLendOffer] = useState<LendOffer | null>(null);
  const [cancelBorrowOffer, setCancelBorrowOffer] = useState<BorrowOffer | null>(null);
  const [cancelLendOffer, setCancelLendOffer] = useState<LendOffer | null>(null);
  const [addCollateralPosition, setAddCollateralPosition] = useState<Position | null>(null);
  const [repayPosition, setRepayPosition] = useState<Position | null>(null);

  // 주식 평가액 계산 (온체인 가격 × 클라이언트 단 보유 주식) - 온체인 토큰 목록 사용
  const totalStockValue = user
    ? collateralTokens.reduce((acc, token) => {
        const quantity = user.stocks?.[token.symbol] || 0;
        const price =
          onChainPrices[token.symbol] || onChainPrices[token.address.toLowerCase()] || 0;
        return acc + quantity * price;
      }, 0)
    : 0;

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

                {/* 주식 보유 현황 (온체인 담보 토큰 목록) */}
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">보유 주식</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {collateralTokens.map((token) => {
                      const quantity = user?.stocks?.[token.symbol] || 0;
                      const price =
                        onChainPrices[token.symbol] ||
                        onChainPrices[token.address.toLowerCase()] ||
                        0;
                      const value = quantity * price;
                      return (
                        <div
                          key={token.address}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span>{token.icon}</span>
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
                  청산 히스토리 ({liquidatedPositions.length})
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
                                    onClick={() => setEditBorrowOffer(offer as any)}
                                  >
                                    수정
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setCancelBorrowOffer(offer as any)}
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
                          const token = collateralTokens.find(
                            (t) => t.symbol === offer.requestedCollateralStock,
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
                                    <span className="text-muted-foreground">대여 금액</span>
                                    <span className="font-medium">
                                      ₩{offer.loanAmount.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">요구 담보</span>
                                    <span className="font-medium">{token?.name}</span>
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
                                    onClick={() => setEditLendOffer(offer as any)}
                                  >
                                    수정
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setCancelLendOffer(offer as any)}
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
                            />
                          ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* 청산 히스토리 탭 */}
              <TabsContent value="liquidations">
                {liquidatedPositions.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <AlertTriangle className="mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-lg font-medium">청산 내역이 없습니다</p>
                      <p className="text-muted-foreground">청산된 포지션이 없습니다</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {liquidatedPositions.map((position) => {
                      // UIBorrowOffer 타입인지 확인
                      const isBorrowOffer = 'collateralStock' in position;
                      const collateralStock = isBorrowOffer
                        ? (position as UIBorrowOffer).collateralStock
                        : (position as UILendOffer).requestedCollateralStock;
                      const token = collateralTokens.find((t) => t.symbol === collateralStock);
                      const borrower = isBorrowOffer
                        ? (position as UIBorrowOffer).borrower
                        : (position as UILendOffer).borrower;
                      const isBorrower =
                        walletAddress && borrower && borrower.toLowerCase() === walletAddress;
                      const accruedInterest = isBorrowOffer
                        ? (position as UIBorrowOffer).accruedInterest || 0
                        : 0;
                      return (
                        <Card
                          key={
                            (position as UIBorrowOffer | UILendOffer).onChainId?.toString() ||
                            position.id
                          }
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
                                <span className="text-muted-foreground">담보</span>
                                <span className="font-medium">
                                  {position.collateralAmount.toLocaleString()}주 {token?.name}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">대출금</span>
                                <span className="font-medium">
                                  ₩{position.loanAmount.toLocaleString()}
                                </span>
                              </div>
                              {isBorrowOffer && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">청산 시점 이자</span>
                                  <span className="font-medium">
                                    ₩{accruedInterest.toLocaleString()}
                                  </span>
                                </div>
                              )}
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
        onClose={() => setEditBorrowOffer(null)}
        offer={editBorrowOffer}
        type="borrow"
      />
      <EditOfferModal
        open={!!editLendOffer}
        onClose={() => setEditLendOffer(null)}
        offer={editLendOffer}
        type="lend"
      />
      <CancelOfferModal
        open={!!cancelBorrowOffer}
        onClose={() => setCancelBorrowOffer(null)}
        offer={cancelBorrowOffer}
        type="borrow"
      />
      <CancelOfferModal
        open={!!cancelLendOffer}
        onClose={() => setCancelLendOffer(null)}
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
