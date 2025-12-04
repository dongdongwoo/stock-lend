'use client';

import { useState, useEffect } from 'react';
import { parseUnits } from 'viem';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStore } from '@/lib/store';
import {
  useOraclePricesWagmi,
  useCollateralRiskParamsWagmi,
  useAllowedCollateralTokensWagmi,
} from '@/lib/hooks';
import { mapCollateralTokens, CONTRACTS } from '@/lib/contracts/config';
import { createLendOffer, createBorrowOffer } from '@/lib/contracts/lending';
import { approveTokenForLending, mintTokenByMaster } from '@/lib/contracts/tokens';
import { getCustodyWalletAddress, ensureEthBalance } from '@/lib/wallet/custody';
import { TransactionModal, type TxStep } from './transaction-modal';
import { ChevronRight } from 'lucide-react';

interface CreateOfferModalProps {
  open: boolean;
  onClose: () => void;
  type: 'borrow' | 'lend';
}

export function CreateOfferModal({ open, onClose, type }: CreateOfferModalProps) {
  const { user, updateUserCash, updateUserStocks } = useStore();
  const { prices: oraclePrice } = useOraclePricesWagmi();
  const { riskParams } = useCollateralRiskParamsWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  const [selectedStock, setSelectedStock] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('KRW');
  const [amount, setAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [maturityMonths, setMaturityMonths] = useState<number | null>(null);
  const [loanAmount, setLoanAmount] = useState('');

  const [showTx, setShowTx] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [txHash, setTxHash] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const isBorrow = type === 'borrow';

  const maturityOptions = [
    { label: '1개월', months: 1, days: 30 },
    { label: '3개월', months: 3, days: 90 },
    { label: '6개월', months: 6, days: 180 },
    { label: '1년', months: 12, days: 365 },
  ];

  const getMaturityDays = () => {
    const option = maturityOptions.find((o) => o.months === maturityMonths);
    return option?.days || 30;
  };

  const getMaturitySeconds = () => {
    return BigInt(getMaturityDays() * 24 * 60 * 60);
  };

  useEffect(() => {
    if (open) {
      setSelectedStock('');
      setSelectedCurrency('KRW');
      setAmount('');
      setLoanAmount('');
      setInterestRate('');
      setMaturityMonths(null);
      setTxError(null);
    }
  }, [open]);

  // 담보 토큰 정보 (온체인 데이터 사용)
  const collateralToken = collateralTokens.find((t) => t.symbol === selectedStock);
  const stockPrice = collateralToken
    ? oraclePrice[collateralToken.symbol] || oraclePrice[collateralToken.address.toLowerCase()] || 0
    : 0;
  const collateralValueInKRW = isBorrow && amount ? Number.parseFloat(amount) * stockPrice : 0;

  // 온체인에서 LTV 가져오기 (주소 또는 symbol로 조회)
  const maxLtvBps = collateralToken
    ? riskParams[collateralToken.symbol]?.maxLtvBps ||
      riskParams[collateralToken.address.toLowerCase()]?.maxLtvBps ||
      riskParams[collateralToken.address]?.maxLtvBps ||
      BigInt(6000) // 기본값 60% (사용자가 설정한 값)
    : BigInt(6000);
  const maxLtv = Number(maxLtvBps) / 10000; // bps to decimal (예: 6000 bps = 0.6 = 60%)

  const maxLoanAmount = collateralValueInKRW * maxLtv;
  const currentLtv =
    isBorrow && loanAmount && collateralValueInKRW
      ? (Number.parseFloat(loanAmount) / collateralValueInKRW) * 100
      : 0;
  const isLtvValid = currentLtv <= maxLtv * 100;

  // 클라이언트 store 잔액 사용 (포트폴리오와 동일한 데이터 소스)
  const maxStockAvailable = isBorrow
    ? user?.stocks?.[selectedStock] ?? 0
    : user?.stocks?.[selectedStock] ?? 0;
  const maxCashAvailable = isBorrow ? user?.cash ?? 0 : user?.cash ?? 0;

  const isValid = isBorrow
    ? selectedStock &&
      selectedCurrency &&
      amount &&
      loanAmount &&
      Number.parseFloat(loanAmount) <= maxLoanAmount &&
      Number.parseFloat(amount) <= maxStockAvailable &&
      Number.parseFloat(amount) > 0 &&
      Number.parseFloat(loanAmount) > 0 &&
      isLtvValid &&
      interestRate &&
      Number(interestRate) > 0 &&
      maturityMonths !== null
    : selectedCurrency &&
      selectedStock &&
      amount &&
      Number.parseFloat(amount) <= maxCashAvailable &&
      Number.parseFloat(amount) > 0 &&
      interestRate &&
      Number(interestRate) > 0 &&
      maturityMonths !== null;

  const handleSubmit = async () => {
    if (!user || !isValid || !collateralToken) return;

    setShowTx(true);
    setIsComplete(false);
    setTxError(null);

    const steps: TxStep[] = isBorrow
      ? [
          { id: 'legacy', label: '유저계좌 확인', status: 'active' },
          { id: 'pledge', label: `담보 질권설정(유저계좌)`, status: 'pending' },
          {
            id: 'tokenize',
            label: `담보 → ${collateralToken?.symbol} 토큰 발행`,
            status: 'pending',
          },
          { id: 'approve', label: '담보 토큰 Approve', status: 'pending' },
          { id: 'create', label: '대출 상품 생성 트랜잭션', status: 'pending' },
          { id: 'confirm', label: '트랜잭션 확인', status: 'pending' },
        ]
      : [
          { id: 'legacy', label: '유저계좌 확인', status: 'active' },
          { id: 'bond_update', label: '채권 수정', status: 'pending' },
          { id: 'mint', label: 'dKRW 토큰 발행', status: 'pending' },
          { id: 'approve', label: 'dKRW 토큰 Approve', status: 'pending' },
          { id: 'create', label: '대여 상품 생성 트랜잭션', status: 'pending' },
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

      // ETH 잔액 확인 및 전송 (트랜잭션 실행 전 필수)
      const ethTxHash = await ensureEthBalance(userAddress);
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'eth'
            ? { ...s, status: 'complete' }
            : s.id === 'legacy'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // 레거시 시스템 연동 (시뮬레이션: 2~5초 랜덤 대기)
      const legacyDelay = Math.floor(Math.random() * 3000) + 2000; // 2000~5000ms
      await new Promise((resolve) => setTimeout(resolve, legacyDelay));
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'legacy'
            ? { ...s, status: 'complete' }
            : s.id === (isBorrow ? 'pledge' : 'bond_update')
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      // 대여 상품의 경우: 채권 수정 (시뮬레이션)
      if (!isBorrow) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'bond_update'
              ? { ...s, status: 'complete' }
              : s.id === 'mint'
              ? { ...s, status: 'active' }
              : s,
          ),
        );
      }

      // 금액을 18 decimals로 변환
      const amountInWei = parseUnits(amount, 18);
      const loanAmountInWei = isBorrow ? parseUnits(loanAmount, 18) : amountInWei;
      const interestRateBps = BigInt(Math.round(Number(interestRate) * 100)); // % to bps
      const duration = getMaturitySeconds();
      const earlyRepayFeeBps = BigInt(100); // 1% 조기상환 수수료

      if (isBorrow) {
        // 1. 담보 질권설정 (시뮬레이션)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'pledge'
              ? { ...s, status: 'complete' }
              : s.id === 'tokenize'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // 2. 담보 → 담보 토큰 발행 (Master Mint)
        await mintTokenByMaster('collateral', userAddress, amountInWei);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'tokenize'
              ? { ...s, status: 'complete' }
              : s.id === 'approve'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // 3. 담보 토큰 Approve
        await approveTokenForLending('collateral', amountInWei, user.id);

        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'approve'
              ? { ...s, status: 'complete' }
              : s.id === 'create'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // 4. Borrow Offer 생성
        const hash = await createBorrowOffer(
          {
            collateralToken: collateralToken.address,
            lendToken: CONTRACTS.lendToken,
            collateralAmount: amountInWei,
            loanAmount: loanAmountInWei,
            interestRateBps,
            duration,
            earlyRepayFeeBps,
          },
          user.id,
        );
        setTxHash(hash);

        // 5. 담보 주식 차감
        updateUserStocks(selectedStock, -Number.parseFloat(amount));
      } else {
        // 대여 상품 등록: master mint → approve → create
        // 1. Master가 유저에게 dKRW 토큰 Mint
        await mintTokenByMaster('lend', userAddress, amountInWei);

        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'mint'
              ? { ...s, status: 'complete' }
              : s.id === 'approve'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // 2. dKRW 토큰 Approve
        await approveTokenForLending('lend', amountInWei, user.id);

        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'approve'
              ? { ...s, status: 'complete' }
              : s.id === 'create'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // 3. Lend Offer 생성
        const hash = await createLendOffer(
          {
            collateralToken: collateralToken.address,
            lendToken: CONTRACTS.lendToken,
            loanAmount: amountInWei,
            interestRateBps,
            duration,
            earlyRepayFeeBps,
          },
          user.id,
        );
        setTxHash(hash);

        // 4. 대여 원화 차감
        updateUserCash(-Number.parseFloat(amount));
      }

      // 3. 완료
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'create'
            ? { ...s, status: 'complete' }
            : s.id === 'confirm'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      setTxSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));
      setIsComplete(true);
    } catch (error) {
      console.error('Create offer failed:', error);
      setTxError(error instanceof Error ? error.message : '상품 등록 실패');
      setTxSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' as const } : s)),
      );
    }
  };

  const handleClose = () => {
    setShowTx(false);
    setTxSteps([]);
    setTxHash('');
    setIsComplete(false);
    setAmount('');
    setLoanAmount('');
    setSelectedStock('');
    setSelectedCurrency('KRW');
    setInterestRate('');
    setMaturityMonths(null);
    onClose();
  };

  const handlePercentage = (percent: number, isStock: boolean) => {
    if (isStock) {
      const value = (maxStockAvailable * percent) / 100;
      setAmount(value.toString());
      setLoanAmount('');
    } else {
      const value = (maxCashAvailable * percent) / 100;
      setAmount(value.toString());
    }
  };

  if (showTx) {
    return (
      <TransactionModal
        open={showTx}
        onClose={handleClose}
        title={isBorrow ? '대출 상품 등록' : '대여 상품 등록'}
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
          <DialogTitle>{isBorrow ? '대출 상품 등록' : '대여 상품 등록'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 대여 상품 등록 */}
          {!isBorrow && (
            <>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-sm text-muted-foreground">보유 현금</p>
                <p className="text-xl font-bold">₩{maxCashAvailable.toLocaleString()}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>대여 금액 (원)</Label>
                  <span className="text-xs text-muted-foreground">
                    최대: ₩{maxCashAvailable.toLocaleString()}
                  </span>
                </div>
                <Input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <div className="flex gap-2">
                  {[10, 25, 50, 100].map((percent) => (
                    <Button
                      key={percent}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => handlePercentage(percent, false)}
                    >
                      {percent}%
                    </Button>
                  ))}
                </div>
              </div>

              {amount && Number(amount) > 0 && (
                <div className="space-y-2">
                  <Label>요청할 담보 토큰</Label>
                  <Select value={selectedStock} onValueChange={setSelectedStock}>
                    <SelectTrigger>
                      <SelectValue placeholder="요청할 담보 토큰을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {collateralTokens.map((token) => {
                        const price =
                          oraclePrice[token.symbol] ||
                          oraclePrice[token.address.toLowerCase()] ||
                          0;
                        return (
                          <SelectItem key={token.symbol} value={token.symbol}>
                            <div className="flex items-center gap-2">
                              <span>{token.icon}</span>
                              <span>{token.name}</span>
                              <span className="text-muted-foreground">
                                (₩{price.toLocaleString()})
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {/* 대출 상품 등록 */}
          {isBorrow && (
            <>
              <div className="space-y-2">
                <Label>담보 토큰 선택</Label>
                <Select
                  value={selectedStock}
                  onValueChange={(v) => {
                    setSelectedStock(v);
                    setAmount('');
                    setLoanAmount('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="담보로 사용할 토큰을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {collateralTokens.map((token) => {
                      const price =
                        oraclePrice[token.symbol] || oraclePrice[token.address.toLowerCase()] || 0;
                      return (
                        <SelectItem key={token.symbol} value={token.symbol}>
                          <div className="flex items-center gap-2">
                            <span>{token.icon}</span>
                            <span>{token.name}</span>
                            <span className="text-muted-foreground">
                              (₩{price.toLocaleString()})
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {selectedStock && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>담보 수량 (주)</Label>
                    <span className="text-xs text-muted-foreground">
                      보유: {maxStockAvailable.toLocaleString()}주
                    </span>
                  </div>
                  <Input
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setLoanAmount('');
                    }}
                  />
                  <div className="flex gap-2">
                    {[10, 25, 50, 100].map((percent) => (
                      <Button
                        key={percent}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-transparent"
                        onClick={() => handlePercentage(percent, true)}
                      >
                        {percent}%
                      </Button>
                    ))}
                  </div>
                  {amount && collateralToken && (
                    <p className="text-sm text-muted-foreground">
                      담보 가치: ₩{collateralValueInKRW.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {selectedStock && amount && Number(amount) > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>대출 희망 금액 (원)</Label>
                    <span className="text-xs text-muted-foreground">
                      최대: ₩{maxLoanAmount.toLocaleString()} (LTV {maxLtv * 100}%)
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="0"
                      value={loanAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setLoanAmount('');
                        } else {
                          const numVal = Number.parseFloat(val);
                          if (numVal > maxLoanAmount) {
                            setLoanAmount(maxLoanAmount.toString());
                          } else {
                            setLoanAmount(val);
                          }
                        }
                      }}
                      className="pr-16"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-semibold text-primary hover:text-primary/80"
                      onClick={() => setLoanAmount(maxLoanAmount.toString())}
                    >
                      MAX
                    </Button>
                  </div>
                  {loanAmount && (
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          currentLtv > 60 ? 'text-yellow-500' : 'text-primary'
                        }`}
                      >
                        LTV: {currentLtv.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 가이드 메시지 */}
          {((isBorrow && !selectedStock) || (!isBorrow && (!amount || Number(amount) <= 0))) && (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                {isBorrow
                  ? '담보 주식을 선택하면 다음 단계가 표시됩니다'
                  : '대여 금액을 입력하면 다음 단계가 표시됩니다'}
              </p>
              <ChevronRight className="mx-auto mt-2 h-5 w-5 text-muted-foreground" />
            </div>
          )}

          {/* 이자율 & 만기 설정 */}
          {((isBorrow && selectedStock && amount && Number(amount) > 0) ||
            (!isBorrow && selectedStock && amount && Number(amount) > 0)) && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>이자율</Label>
                  <span className="font-mono text-sm font-medium">
                    {interestRate !== '' ? `${Number(interestRate).toFixed(1)}%` : '-'}
                  </span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="30"
                    placeholder="0"
                    value={interestRate}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setInterestRate('');
                      } else {
                        const numVal = Number.parseFloat(val);
                        if (!isNaN(numVal) && numVal >= 0 && numVal <= 30) {
                          setInterestRate(val);
                        }
                      }
                    }}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">0% ~ 30% 범위에서 설정 가능</p>
              </div>

              <div className="space-y-3">
                <Label>만기</Label>
                <div className="grid grid-cols-4 gap-2">
                  {maturityOptions.map((option) => (
                    <Button
                      key={option.months}
                      type="button"
                      variant={maturityMonths === option.months ? 'default' : 'outline'}
                      size="sm"
                      className={maturityMonths === option.months ? '' : 'bg-transparent'}
                      onClick={() => setMaturityMonths(option.months)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 요약 */}
              <div className="rounded-lg bg-secondary p-4">
                <h4 className="mb-2 text-sm font-medium">요약</h4>
                <div className="space-y-1 text-sm">
                  {isBorrow ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">담보</span>
                        <span>
                          {Number(amount).toLocaleString()} {collateralToken?.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">담보 가치</span>
                        <span>₩{collateralValueInKRW.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">대출 희망</span>
                        <span>₩{Number(loanAmount || 0).toLocaleString()}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">대여 금액</span>
                        <span>₩{Number(amount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">요청 담보</span>
                        <span>{collateralToken?.name}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">이자율</span>
                    <span>{interestRate || 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">만기</span>
                    <span>
                      {maturityOptions.find((o) => o.months === maturityMonths)?.label || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          <Button onClick={handleSubmit} className="w-full" disabled={!isValid}>
            {isBorrow ? '대출 상품 등록' : '대여 상품 등록'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
