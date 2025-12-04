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

  const [activeTab, setActiveTab] = useState<'cash' | 'stock'>('cash');
  const [cashAmount, setCashAmount] = useState('');
  const [selectedStock, setSelectedStock] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
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

    updateUserStocks(selectedStock, Number(stockQuantity));
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
    onClose();
  };

  if (showTx) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{activeTab === 'cash' ? '원화 구매' : '주식 구매'}</DialogTitle>
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'cash' | 'stock')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cash" className="gap-2">
              <Banknote className="h-4 w-4" />
              원화 구매
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              주식 구매
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

          <TabsContent value="stock" className="space-y-4 pt-4">
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
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">현재 보유량</p>
                  <p className="text-xl font-bold">
                    {(user.stocks?.[selectedStock] ?? 0).toLocaleString()}주
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>구매 수량 (주)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                  />
                  <div className="flex gap-2">
                    {[1, 5, 10, 50].map((qty) => (
                      <Button
                        key={qty}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-transparent"
                        onClick={() => setStockQuantity(qty.toString())}
                      >
                        {qty}주
                      </Button>
                    ))}
                  </div>
                  {stockQuantity && (
                    <p className="text-sm text-muted-foreground">
                      예상 금액: ₩{stockTotalCost.toLocaleString()}
                    </p>
                  )}
                </div>
              </>
            )}

            <Button
              onClick={handleBuyStock}
              className="w-full"
              disabled={!selectedStock || !stockQuantity || Number(stockQuantity) <= 0}
            >
              주식 구매하기
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
