'use client';

import { useState } from 'react';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStore } from '@/lib/store';
import { useLendOffersWagmi, type UILendOffer } from '@/lib/hooks';
import { getCustodyWalletAddress } from '@/lib/wallet/custody';
import { OfferCard } from '@/components/offer-card';
import { CreateOfferModal } from '@/components/create-offer-modal';
import { EditOfferModal } from '@/components/edit-offer-modal';
import { CancelOfferModal } from '@/components/cancel-offer-modal';
import { MatchModal } from '@/components/match-modal';
import { LoginModal } from '@/components/login-modal';
import { Plus, TrendingUp, Wallet } from 'lucide-react';

export default function LendPage() {
  const { user } = useStore();

  // 온체인 대여 상품 조회 (wagmi)
  const { offers: onChainLendOffers } = useLendOffersWagmi();

  const [showCreate, setShowCreate] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [matchOffer, setMatchOffer] = useState<{
    offer: UILendOffer;
    type: 'borrow' | 'lend';
  } | null>(null);
  const [editOffer, setEditOffer] = useState<UILendOffer | null>(null);
  const [cancelOffer, setCancelOffer] = useState<UILendOffer | null>(null);

  // 현재 유저의 지갑 주소
  const walletAddress = user ? getCustodyWalletAddress(user.id)?.toLowerCase() : null;

  // Active 상품만 필터링 (cancelled, closed, liquidated, matched 제외)
  const allLendOffers = onChainLendOffers.filter((o) => o.status === 'active');

  // 내 상품 필터링 (지갑 주소로 비교)
  const myOffers = onChainLendOffers.filter((o) => o.lender.toLowerCase() === walletAddress);
  const activeOffers = myOffers.filter((o) => o.status === 'active');

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">대여</h1>
            <p className="text-muted-foreground">자금을 대여하고 이자 수익을 얻으세요</p>
          </div>

          {user ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              대여 상품 등록
            </Button>
          ) : (
            <Button onClick={() => setShowLogin(true)}>
              <Wallet className="mr-2 h-4 w-4" />
              계정 연결
            </Button>
          )}
        </div>

        {!user ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wallet className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">계정을 연결해주세요</p>
              <p className="mb-4 text-muted-foreground">
                대여 상품을 등록하려면 먼저 계정을 연결해야 합니다
              </p>
              <Button onClick={() => setShowLogin(true)}>계정 연결</Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="market">
            <TabsList className="mb-6">
              <TabsTrigger value="market">전체 상품 ({allLendOffers.length})</TabsTrigger>
              <TabsTrigger value="active">내 Active ({activeOffers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="market">
              {allLendOffers.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
                    <p className="text-lg font-medium">등록된 대여 상품이 없습니다</p>
                    <p className="text-muted-foreground">
                      대여자가 상품을 등록하면 여기에 표시됩니다
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {allLendOffers.map((offer) => {
                    const isOwner = offer.lender.toLowerCase() === walletAddress;
                    return (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        type="lend"
                        isOwner={isOwner}
                        onMatch={() => setMatchOffer({ offer, type: 'lend' })}
                        onEdit={isOwner ? () => setEditOffer(offer) : undefined}
                        onCancel={isOwner ? () => setCancelOffer(offer) : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="active">
              {activeOffers.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">활성화된 대여 상품이 없습니다</p>
                    <Button className="mt-4" onClick={() => setShowCreate(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      대여 상품 등록
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeOffers.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      type="lend"
                      isOwner={true}
                      onEdit={() => setEditOffer(offer)}
                      onCancel={() => setCancelOffer(offer)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
      <CreateOfferModal open={showCreate} onClose={() => setShowCreate(false)} type="lend" />
      <EditOfferModal
        open={!!editOffer}
        onClose={() => setEditOffer(null)}
        offer={editOffer as any}
        type="lend"
      />
      <CancelOfferModal
        open={!!cancelOffer}
        onClose={() => setCancelOffer(null)}
        offer={cancelOffer as any}
        type="lend"
      />
      {matchOffer && (
        <MatchModal
          open={!!matchOffer}
          onClose={() => setMatchOffer(null)}
          offer={matchOffer.offer as any}
          type={matchOffer.type}
        />
      )}
    </div>
  );
}
