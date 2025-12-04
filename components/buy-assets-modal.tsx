'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { mapCollateralTokens } from '@/lib/contracts/config';
import { useOraclePricesWagmi, useAllowedCollateralTokensWagmi } from '@/lib/hooks';
import { Loader2, CheckCircle2, Banknote, TrendingUp } from 'lucide-react';

interface BuyAssetsModalProps {
  open: boolean;
  onClose: () => void;
}

type TxStep = {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete';
};

export function BuyAssetsModal({ open, onClose }: BuyAssetsModalProps) {
  const { user, updateUserCash, updateUserStocks } = useStore();
  // 온체인 가격 피드 사용
  const { prices: oraclePrices } = useOraclePricesWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  const [activeTab, setActiveTab] = useState<'cash' | 'buy' | 'sell'>('cash');
  const [cashAmount, setCashAmount] = useState('');
  const [selectedStock, setSelectedStock] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [sellQuantity, setSellQuantity] = useState('');
  const [showTx, setShowTx] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  if (!user) return null;

  const stock = collateralTokens.find((s) => s.symbol === selectedStock);
  // 온체인 가격 우선 사용 (symbol 또는 주소로 조회)
  const stockPrice = stock
    ? oraclePrices[stock.symbol] ||
      oraclePrices[stock.address.toLowerCase()] ||
      oraclePrices[stock.address] ||
      0
    : 0;
  const stockTotalCost = stockPrice * Number(stockQuantity || 0);
  const stockTotalRevenue = stockPrice * Number(sellQuantity || 0);
  const userCash = user.cash ?? 0;
  const userStockQuantity = selectedStock ? user.stocks?.[selectedStock] ?? 0 : 0;

  // 구매 가능한 주식 수량 계산
  const maxAffordableQuantity = stockPrice > 0 ? Math.floor(userCash / stockPrice) : 0;

  const handleBuyCash = async () => {
    if (!cashAmount || Number(cashAmount) <= 0) return;

    setShowTx(true);
    setIsComplete(false);

    const steps: TxStep[] = [
      { id: 'verify', label: '계좌 확인', status: 'active' },
      { id: 'transfer', label: '원화 이체', status: 'pending' },
      { id: 'complete', label: '완료', status: 'pending' },
    ];

    setTxSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setTxSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx < i + 1 ? 'complete' : idx === i + 1 ? 'active' : 'pending',
        })),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    updateUserCash(Number(cashAmount));
    setTxSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));
    setIsComplete(true);
  };

  const handleBuyStock = async () => {
    if (!selectedStock || !stockQuantity || Number(stockQuantity) <= 0) return;

    setShowTx(true);
    setIsComplete(false);

    const steps: TxStep[] = [
      { id: 'verify', label: '계좌 확인', status: 'active' },
      { id: 'order', label: '주식 매수 주문', status: 'pending' },
      { id: 'settle', label: '체결 완료', status: 'pending' },
    ];

    setTxSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setTxSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx < i + 1 ? 'complete' : idx === i + 1 ? 'active' : 'pending',
        })),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // 주식 추가 및 현금 차감
    updateUserStocks(selectedStock, Number(stockQuantity));
    updateUserCash(-stockTotalCost);
    setTxSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));
    setIsComplete(true);
  };

  const handleSellStock = async () => {
    if (!selectedStock || !sellQuantity || Number(sellQuantity) <= 0) return;
    if (Number(sellQuantity) > userStockQuantity) return;

    setShowTx(true);
    setIsComplete(false);

    const steps: TxStep[] = [
      { id: 'verify', label: '계좌 확인', status: 'active' },
      { id: 'order', label: '주식 매도 주문', status: 'pending' },
      { id: 'settle', label: '체결 완료', status: 'pending' },
    ];

    setTxSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setTxSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx < i + 1 ? 'complete' : idx === i + 1 ? 'active' : 'pending',
        })),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // 주식 차감 및 현금 추가
    updateUserStocks(selectedStock, -Number(sellQuantity));
    updateUserCash(stockTotalRevenue);
    setTxSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));
    setIsComplete(true);
  };

  const handleClose = () => {
    setShowTx(false);
    setTxSteps([]);
    setIsComplete(false);
    setCashAmount('');
    setSelectedStock('');
    setStockQuantity('');
    setSellQuantity('');
    onClose();
  };

  if (showTx) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeTab === 'cash' ? '원화 구매' : activeTab === 'buy' ? '주식 구매' : '주식 판매'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {txSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                    step.status === 'complete'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : step.status === 'active'
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {step.status === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : step.status === 'active' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <span className="text-sm">{txSteps.indexOf(step) + 1}</span>
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`font-medium ${
                      step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.status === 'active' && (
                    <p className="text-sm text-muted-foreground">처리 중...</p>
                  )}
                </div>
              </div>
            ))}

            {isComplete && (
              <div className="mt-4 rounded-lg bg-primary/10 p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary" />
                <p className="font-medium text-primary">구매 완료!</p>
                <Button onClick={handleClose} className="mt-4">
                  확인
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>자산 구매</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'cash' | 'buy' | 'sell')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cash" className="gap-2">
              <Banknote className="h-4 w-4" />
              원화 구매
            </TabsTrigger>
            <TabsTrigger value="buy" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              주식 구매
            </TabsTrigger>
            <TabsTrigger value="sell" className="gap-2">
              <TrendingUp className="h-4 w-4 rotate-180" />
              주식 판매
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cash" className="space-y-4 pt-4">
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-sm text-muted-foreground">현재 보유 현금</p>
              <p className="text-xl font-bold">₩{(user.cash ?? 0).toLocaleString()}</p>
            </div>

            <div className="space-y-2">
              <Label>구매 금액 (원)</Label>
              <Input
                type="number"
                placeholder="0"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
              />
              <div className="flex gap-2">
                {[100000, 500000, 1000000, 5000000].map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-transparent text-xs"
                    onClick={() => setCashAmount(amount.toString())}
                  >
                    {(amount / 10000).toLocaleString()}만
                  </Button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleBuyCash}
              className="w-full"
              disabled={!cashAmount || Number(cashAmount) <= 0}
            >
              원화 구매하기
            </Button>
          </TabsContent>

          <TabsContent value="buy" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>주식 선택</Label>
              <Select value={selectedStock} onValueChange={setSelectedStock}>
                <SelectTrigger>
                  <SelectValue placeholder="구매할 주식을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {collateralTokens.map((token) => {
                    const price =
                      oraclePrices[token.symbol] || oraclePrices[token.address.toLowerCase()] || 0;
                    return (
                      <SelectItem key={token.symbol} value={token.symbol}>
                        <div className="flex items-center gap-2">
                          <span>{token.icon}</span>
                          <span>{token.name}</span>
                          <span className="text-muted-foreground">(₩{price.toLocaleString()})</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedStock && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary p-3">
                    <p className="text-sm text-muted-foreground">보유 현금</p>
                    <p className="text-xl font-bold">₩{userCash.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-3">
                    <p className="text-sm text-muted-foreground">보유 주식</p>
                    <p className="text-xl font-bold">
                      {(user.stocks?.[selectedStock] ?? 0).toLocaleString()}주
                    </p>
                  </div>
                </div>

                {stockPrice > 0 && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm text-muted-foreground">구매 가능 수량</p>
                    <p className="text-lg font-semibold text-primary">
                      최대 {maxAffordableQuantity.toLocaleString()}주
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      (₩{userCash.toLocaleString()} ÷ ₩{stockPrice.toLocaleString()})
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>구매 수량 (주)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    min="0"
                    max={maxAffordableQuantity}
                    value={stockQuantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setStockQuantity('');
                      } else {
                        const numVal = Number.parseInt(val, 10);
                        if (!isNaN(numVal) && numVal >= 0) {
                          // 구매 가능 수량을 초과하지 않도록 제한
                          const maxQty = maxAffordableQuantity;
                          setStockQuantity(Math.min(numVal, maxQty).toString());
                        }
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    {[1, 5, 10, 50].map((qty) => {
                      const isDisabled = qty > maxAffordableQuantity;
                      return (
                        <Button
                          key={qty}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-transparent"
                          disabled={isDisabled}
                          onClick={() => {
                            const finalQty = Math.min(qty, maxAffordableQuantity);
                            setStockQuantity(finalQty.toString());
                          }}
                        >
                          {qty}주
                        </Button>
                      );
                    })}
                    {maxAffordableQuantity > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-transparent"
                        onClick={() => setStockQuantity(maxAffordableQuantity.toString())}
                      >
                        최대
                      </Button>
                    )}
                  </div>
                  {stockQuantity && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        예상 금액: ₩{stockTotalCost.toLocaleString()}
                      </p>
                      {stockTotalCost > userCash && (
                        <p className="text-sm text-destructive">
                          보유 현금이 부족합니다. (부족: ₩
                          {(stockTotalCost - userCash).toLocaleString()})
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <Button
              onClick={handleBuyStock}
              className="w-full"
              disabled={
                !selectedStock ||
                !stockQuantity ||
                Number(stockQuantity) <= 0 ||
                stockTotalCost > userCash
              }
            >
              주식 구매하기
            </Button>
          </TabsContent>

          <TabsContent value="sell" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>주식 선택</Label>
              <Select value={selectedStock} onValueChange={setSelectedStock}>
                <SelectTrigger>
                  <SelectValue placeholder="판매할 주식을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {collateralTokens
                    .filter((token) => (user.stocks?.[token.symbol] ?? 0) > 0)
                    .map((token) => {
                      const price =
                        oraclePrices[token.symbol] ||
                        oraclePrices[token.address.toLowerCase()] ||
                        0;
                      const quantity = user.stocks?.[token.symbol] ?? 0;
                      return (
                        <SelectItem key={token.symbol} value={token.symbol}>
                          <div className="flex items-center gap-2">
                            <span>{token.icon}</span>
                            <span>{token.name}</span>
                            <span className="text-muted-foreground">
                              ({quantity.toLocaleString()}주 보유)
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>

            {selectedStock && userStockQuantity > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary p-3">
                    <p className="text-sm text-muted-foreground">보유 주식</p>
                    <p className="text-xl font-bold">{userStockQuantity.toLocaleString()}주</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-3">
                    <p className="text-sm text-muted-foreground">보유 현금</p>
                    <p className="text-xl font-bold">₩{userCash.toLocaleString()}</p>
                  </div>
                </div>

                {stockPrice > 0 && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm text-muted-foreground">현재 주가</p>
                    <p className="text-lg font-semibold text-primary">
                      ₩{stockPrice.toLocaleString()}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>판매 수량 (주)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    min="0"
                    max={userStockQuantity}
                    value={sellQuantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setSellQuantity('');
                      } else {
                        const numVal = Number.parseInt(val, 10);
                        if (!isNaN(numVal) && numVal >= 0) {
                          // 보유 수량을 초과하지 않도록 제한
                          setSellQuantity(Math.min(numVal, userStockQuantity).toString());
                        }
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    {[1, 5, 10, 50].map((qty) => {
                      const isDisabled = qty > userStockQuantity;
                      return (
                        <Button
                          key={qty}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-transparent"
                          disabled={isDisabled}
                          onClick={() => {
                            const finalQty = Math.min(qty, userStockQuantity);
                            setSellQuantity(finalQty.toString());
                          }}
                        >
                          {qty}주
                        </Button>
                      );
                    })}
                    {userStockQuantity > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-transparent"
                        onClick={() => setSellQuantity(userStockQuantity.toString())}
                      >
                        전량
                      </Button>
                    )}
                  </div>
                  {sellQuantity && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        예상 금액: ₩{stockTotalRevenue.toLocaleString()}
                      </p>
                      {Number(sellQuantity) > userStockQuantity && (
                        <p className="text-sm text-destructive">
                          보유 주식이 부족합니다. (부족: {Number(sellQuantity) - userStockQuantity}
                          주)
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {selectedStock && userStockQuantity === 0 && (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-center">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  보유한 주식이 없습니다.
                </p>
              </div>
            )}

            <Button
              onClick={handleSellStock}
              className="w-full"
              disabled={
                !selectedStock ||
                !sellQuantity ||
                Number(sellQuantity) <= 0 ||
                Number(sellQuantity) > userStockQuantity ||
                userStockQuantity === 0
              }
            >
              주식 판매하기
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
