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
  useCategoriesWagmi,
  useCategoryTokensWagmi,
} from '@/lib/hooks';
import { mapCollateralTokens, CONTRACTS, CATEGORY_IDS } from '@/lib/contracts/config';
import { formatNumberWithCommas, removeCommas } from '@/lib/utils';
import { createLendOffer, createBorrowOffer } from '@/lib/contracts/lending';
import { approveTokenForLending, mintTokenByMaster } from '@/lib/contracts/tokens';
import { getCustodyWalletAddress, ensureEthBalance } from '@/lib/wallet/custody';
import { TransactionModal, type TxStep } from './transaction-modal';
import { ChevronRight } from 'lucide-react';
import { TokenIcon } from '@/components/token-icon';

interface CreateOfferModalProps {
  open: boolean;
  onClose: () => void;
  type: 'borrow' | 'lend';
}

export function CreateOfferModal({ open, onClose, type }: CreateOfferModalProps) {
  const { user, updateUserCash, updateUserStocks } = useStore();
  const { prices: oraclePrice } = useOraclePricesWagmi();
  const { riskParams } = useCollateralRiskParamsWagmi();
  const { categories } = useCategoriesWagmi();

  // 선택된 카테고리
  const [selectedCategoryId, setSelectedCategoryId] = useState<bigint | null>(null);
  // 선택된 카테고리의 토큰 목록
  const { tokens: availableTokens } = useCategoryTokensWagmi(selectedCategoryId);

  const [selectedStock, setSelectedStock] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('KRW');
  const [amount, setAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [maturityMonths, setMaturityMonths] = useState<number | null>(null);
  const [loanAmount, setLoanAmount] = useState('');
  const [earlyRepayFee, setEarlyRepayFee] = useState('');

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
      setSelectedCategoryId(null);
      setSelectedStock('');
      setSelectedCurrency('KRW');
      setAmount('');
      setLoanAmount('');
      setInterestRate('');
      setMaturityMonths(null);
      setEarlyRepayFee('');
      setTxError(null);
    }
  }, [open]);

  // 카테고리 선택 시 토큰 목록 초기화 (대출 상품만 amount 리셋)
  useEffect(() => {
    if (selectedCategoryId !== null) {
      setSelectedStock('');
      // 대출 상품의 경우에만 amount 리셋 (대여 상품은 대여 금액을 먼저 입력하므로 유지)
      if (isBorrow) {
        setAmount('');
      }
      setLoanAmount('');
    }
  }, [selectedCategoryId, isBorrow]);

  // 카테고리 선택 시 첫 번째 토큰 자동 선택 (대출 상품만, 토큰이 있는 경우)
  useEffect(() => {
    if (isBorrow && selectedCategoryId !== null && availableTokens.length > 0 && !selectedStock) {
      setSelectedStock(availableTokens[0].symbol);
    }
  }, [selectedCategoryId, availableTokens, selectedStock, isBorrow]);

  // 담보 토큰 정보 (온체인 데이터 사용)
  // 대여 상품의 경우: 종목군의 첫 번째 토큰 사용 (종목군만 선택하므로)
  // 대출 상품의 경우: 선택된 토큰 사용
  const collateralToken = isBorrow
    ? availableTokens.find((t) => t.symbol === selectedStock)
    : availableTokens.length > 0
    ? availableTokens[0]
    : null;
  const stockPrice = collateralToken
    ? oraclePrice[collateralToken.symbol] || oraclePrice[collateralToken.address.toLowerCase()] || 0
    : 0;
  const collateralValueInKRW = isBorrow && amount ? Number.parseFloat(amount) * stockPrice : 0;

  // 온체인에서 LTV 가져오기 (주소 또는 symbol로 조회)
  const maxLtvBps = collateralToken
    ? riskParams[collateralToken.symbol]?.maxLtvBps ||
      riskParams[collateralToken.address.toLowerCase()]?.maxLtvBps ||
      riskParams[collateralToken.address]?.maxLtvBps ||
      BigInt(6000) // 기본값 60%
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
      maturityMonths !== null &&
      earlyRepayFee !== '' &&
      Number(earlyRepayFee) >= 0 &&
      Number(earlyRepayFee) <= 100
    : selectedCurrency &&
      selectedCategoryId &&
      availableTokens.length > 0 && // 종목군에 토큰이 있어야 함
      amount &&
      Number.parseFloat(amount) <= maxCashAvailable &&
      Number.parseFloat(amount) > 0 &&
      interestRate &&
      Number(interestRate) > 0 &&
      maturityMonths !== null &&
      earlyRepayFee !== '' &&
      Number(earlyRepayFee) >= 0 &&
      Number(earlyRepayFee) <= 100;

  const handleSubmit = async () => {
    if (!user || !isValid) return;
    // 대출 상품의 경우 collateralToken 필요, 대여 상품의 경우 selectedCategoryId 필요
    if (isBorrow && !collateralToken) return;
    if (!isBorrow && !selectedCategoryId) return;

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

      // 레거시 시스템 연동 (시뮬레이션: 평균 4~5초 랜덤 대기)
      const legacyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
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
        const bondUpdateDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
        await new Promise((resolve) => setTimeout(resolve, bondUpdateDelay));
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
      const earlyRepayFeeBps = BigInt(Math.round(Number(earlyRepayFee) * 100)); // % to bps

      if (isBorrow) {
        // 대출 상품의 경우 collateralToken이 필수
        if (!collateralToken) {
          throw new Error('담보 토큰을 선택해주세요.');
        }

        // 1. 담보 질권설정 (시뮬레이션)
        const pledgeDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
        await new Promise((resolve) => setTimeout(resolve, pledgeDelay));
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
        if (!collateralToken) {
          throw new Error('담보 토큰을 선택해주세요.');
        }
        await mintTokenByMaster('collateral', userAddress, amountInWei, collateralToken.address);
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
        if (!collateralToken) {
          throw new Error('담보 토큰을 선택해주세요.');
        }
        await approveTokenForLending('collateral', amountInWei, user.id, collateralToken.address);

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
        // 대여 상품의 경우: categoryId를 사용
        if (!selectedCategoryId) {
          throw new Error('종목군을 선택해주세요.');
        }
        const hash = await createLendOffer(
          {
            categoryId: selectedCategoryId,
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

      const confirmDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
      await new Promise((resolve) => setTimeout(resolve, confirmDelay));

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
    setEarlyRepayFee('');
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
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatNumberWithCommas(amount)}
                  onChange={(e) => {
                    const numericValue = removeCommas(e.target.value);
                    setAmount(numericValue);
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
                      onClick={() => handlePercentage(percent, false)}
                    >
                      {percent}%
                    </Button>
                  ))}
                </div>
              </div>

              {amount && Number(amount) > 0 && (
                <div className="space-y-2">
                  <Label>종목군 선택</Label>
                  <Select
                    value={selectedCategoryId?.toString() || ''}
                    onValueChange={(value) => {
                      const categoryId = BigInt(value);
                      setSelectedCategoryId(categoryId);
                      setSelectedStock('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="종목군을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id.toString()} value={category.id.toString()}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedCategoryId && (
                <div className="space-y-2">
                  <Label>담보 가능 토큰 목록</Label>
                  <div className="rounded-lg border bg-secondary/50 p-3">
                    {availableTokens.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        선택한 종목군에 담보 토큰이 없습니다.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {availableTokens.map((token) => {
                          const price =
                            oraclePrice[token.symbol] ||
                            oraclePrice[token.address.toLowerCase()] ||
                            0;
                          return (
                            <div
                              key={token.symbol}
                              className="flex items-center justify-between rounded-md bg-background p-2"
                            >
                              <div className="flex items-center gap-2">
                                <TokenIcon icon={token.icon} name={token.name} size={20} />
                                <span className="text-sm font-medium">{token.name}</span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                ₩{price.toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    선택한 종목군에 포함된 모든 토큰이 담보로 사용 가능합니다.
                  </p>
                </div>
              )}
            </>
          )}

          {/* 대출 상품 등록 */}
          {isBorrow && (
            <>
              <div className="space-y-2">
                <Label>종목군 선택</Label>
                <Select
                  value={selectedCategoryId?.toString() || ''}
                  onValueChange={(value) => {
                    const categoryId = BigInt(value);
                    setSelectedCategoryId(categoryId);
                    setSelectedStock('');
                    // 대출 상품의 경우에만 amount 리셋
                    if (isBorrow) {
                      setAmount('');
                    }
                    setLoanAmount('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="종목군을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id.toString()} value={category.id.toString()}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCategoryId && (
                <div className="space-y-2">
                  <Label>담보 토큰 선택</Label>
                  <Select
                    value={selectedStock}
                    onValueChange={(v) => {
                      setSelectedStock(v);
                      // 대출 상품의 경우에만 amount 리셋
                      if (isBorrow) {
                        setAmount('');
                      }
                      setLoanAmount('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="담보로 사용할 토큰을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTokens.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          선택한 종목군에 담보 토큰이 없습니다.
                        </div>
                      ) : (
                        availableTokens.map((token) => {
                          const price =
                            oraclePrice[token.symbol] ||
                            oraclePrice[token.address.toLowerCase()] ||
                            0;
                          return (
                            <SelectItem key={token.symbol} value={token.symbol}>
                              <div className="flex items-center gap-2">
                                <TokenIcon icon={token.icon} name={token.name} size={20} />
                                <span>{token.name}</span>
                                <span className="text-muted-foreground">
                                  (₩{price.toLocaleString()})
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedStock && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>담보 수량 (주)</Label>
                    <span className="text-xs text-muted-foreground">
                      보유: {maxStockAvailable.toLocaleString()}주
                    </span>
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={formatNumberWithCommas(amount)}
                    onChange={(e) => {
                      const numericValue = removeCommas(e.target.value);
                      setAmount(numericValue);
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
                      최대: ₩{maxLoanAmount.toLocaleString()} (LTV {(maxLtv * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatNumberWithCommas(loanAmount)}
                      onChange={(e) => {
                        const numericValue = removeCommas(e.target.value);
                        if (numericValue === '') {
                          setLoanAmount('');
                        } else {
                          const numVal = Number.parseFloat(numericValue);
                          if (!isNaN(numVal)) {
                            if (numVal > maxLoanAmount) {
                              setLoanAmount(maxLoanAmount.toString());
                            } else {
                              setLoanAmount(numericValue);
                            }
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
          {((isBorrow && (!selectedCategoryId || !selectedStock)) ||
            (!isBorrow && (!amount || Number(amount) <= 0 || !selectedCategoryId))) && (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                {isBorrow
                  ? '담보 주식을 선택하면 다음 단계가 표시됩니다'
                  : '대여 금액을 입력하고 종목군을 선택하면 다음 단계가 표시됩니다'}
              </p>
              <ChevronRight className="mx-auto mt-2 h-5 w-5 text-muted-foreground" />
            </div>
          )}

          {/* 이자율 & 만기 설정 */}
          {((isBorrow && selectedCategoryId && selectedStock && amount && Number(amount) > 0) ||
            (!isBorrow && selectedCategoryId && amount && Number(amount) > 0)) && (
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>중도상환수수료</Label>
                  <span className="font-mono text-sm font-medium">
                    {earlyRepayFee !== '' ? `${Number(earlyRepayFee).toFixed(1)}%` : '-'}
                  </span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={earlyRepayFee}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setEarlyRepayFee('');
                      } else {
                        const numVal = Number.parseFloat(val);
                        if (!isNaN(numVal) && numVal >= 0 && numVal <= 100) {
                          setEarlyRepayFee(val);
                        }
                      }
                    }}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  만기 전 상환 시 원금 대비 수수료 (0% ~ 100% 범위에서 설정 가능)
                </p>
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
                        <span className="text-muted-foreground">담보 허용 가능 종목군</span>
                        <span>
                          {selectedCategoryId
                            ? (() => {
                                const selectedCategory = categories.find(
                                  (c) => c.id === selectedCategoryId,
                                );
                                const ltvPercent = maxLtv * 100;
                                return selectedCategory
                                  ? `${selectedCategory.name} (LTV ${ltvPercent.toFixed(0)}%)`
                                  : '-';
                              })()
                            : '-'}
                        </span>
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">중도상환수수료</span>
                    <span>{earlyRepayFee || 0}%</span>
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
