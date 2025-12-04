'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useStore, type BorrowOffer, type LendOffer } from '@/lib/store';
import { mapCollateralTokens } from '@/lib/contracts/config';
import {
  useCollateralRiskParamsWagmi,
  useOraclePricesWagmi,
  useAllowedCollateralTokensWagmi,
} from '@/lib/hooks';
import { TransactionModal, type TxStep } from './transaction-modal';
import { AlertTriangle } from 'lucide-react';
import { parseUnits } from 'viem';
import {
  updateLendOffer as updateLendOfferContract,
  updateBorrowOffer as updateBorrowOfferContract,
} from '@/lib/contracts/lending';
import { approveTokenForLending, mintTokenByMaster } from '@/lib/contracts/tokens';
import { CONTRACTS } from '@/lib/contracts/config';
import { getCustodyWalletAddress, ensureEthBalance } from '@/lib/wallet/custody';

interface EditOfferModalProps {
  open: boolean;
  onClose: () => void;
  offer: BorrowOffer | LendOffer | null;
  type: 'borrow' | 'lend';
}

export function EditOfferModal({ open, onClose, offer, type }: EditOfferModalProps) {
  const { user, updateBorrowOffer, updateUserStocks, updateUserCash } = useStore();
  const { prices: oraclePrice } = useOraclePricesWagmi();
  const { riskParams } = useCollateralRiskParamsWagmi();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  const isBorrow = type === 'borrow';
  const borrowOffer = offer as BorrowOffer;
  const lendOffer = offer as LendOffer;

  // State for borrow
  const [collateralAmount, setCollateralAmount] = useState('');
  const [loanAmount, setLoanAmount] = useState('');

  // State for lend
  const [cashAmount, setCashAmount] = useState('');
  const [requestedCollateralStock, setRequestedCollateralStock] = useState('');

  // Common state
  const [interestRate, setInterestRate] = useState('');
  const [maturityDays, setMaturityDays] = useState(30);

  const [showTx, setShowTx] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [txHash, setTxHash] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Initialize values when modal opens
  useEffect(() => {
    if (open && offer) {
      if (isBorrow) {
        setCollateralAmount(borrowOffer.collateralAmount.toString());
        setLoanAmount(borrowOffer.loanAmount.toString());
      } else {
        setCashAmount(lendOffer.loanAmount.toString());
        setRequestedCollateralStock(lendOffer.requestedCollateralStock);
      }
      setInterestRate(offer.interestRate.toString());
      setMaturityDays(offer.maturityDays);
    }
  }, [open, offer, isBorrow, borrowOffer, lendOffer]);

  if (!user || !offer) return null;

  // Calculate values for borrow - 온체인 데이터 사용
  const stock = isBorrow
    ? collateralTokens.find((s) => s.symbol === borrowOffer.collateralStock)
    : null;
  const stockPrice = stock
    ? oraclePrice[stock.symbol] || oraclePrice[stock.address.toLowerCase()] || 0
    : 0;

  const originalCollateralAmount = isBorrow ? borrowOffer.collateralAmount : 0;
  const newCollateralAmount = Number.parseFloat(collateralAmount) || 0;
  const collateralDiff = newCollateralAmount - originalCollateralAmount;

  const currentStockBalance = stock ? user.stocks?.[stock.symbol] || 0 : 0;
  const maxCollateralAvailable = currentStockBalance + originalCollateralAmount;

  const collateralValue = newCollateralAmount * stockPrice;
  // 온체인에서 LTV 가져오기
  const maxLtvBps = stock ? riskParams[stock.symbol]?.maxLtvBps || BigInt(7000) : BigInt(7000);
  const maxLtv = Number(maxLtvBps) / 10000; // bps to decimal (예: 7000 bps = 0.7 = 70%)
  const maxLoanAmount = collateralValue * maxLtv;
  const newLoanAmount = Number.parseFloat(loanAmount) || 0;
  const currentLtv = collateralValue > 0 ? (newLoanAmount / collateralValue) * 100 : 0;
  const isLtvValid = currentLtv <= maxLtv * 100;

  // Calculate values for lend
  const originalCashAmount = !isBorrow ? lendOffer.loanAmount : 0;
  const newCashAmount = Number.parseFloat(cashAmount) || 0;
  const cashDiff = newCashAmount - originalCashAmount;
  const currentCashBalance = user.cash || 0;
  const maxCashAvailable = currentCashBalance + originalCashAmount;

  const percentButtons = [10, 25, 50, 100];

  const handleCollateralPercent = (percent: number) => {
    const amount = Math.floor(maxCollateralAvailable * (percent / 100));
    setCollateralAmount(amount.toString());
  };

  const handleCashPercent = (percent: number) => {
    const amount = Math.floor(maxCashAvailable * (percent / 100));
    setCashAmount(amount.toString());
  };

  const handleSubmit = async () => {
    const rate = Number.parseFloat(interestRate) || 0;

    if (isBorrow) {
      if (newCollateralAmount <= 0 || newLoanAmount <= 0 || !isLtvValid) return;
    } else {
      if (newCashAmount <= 0 || !requestedCollateralStock) return;
    }

    setShowTx(true);
    setIsComplete(false);
    setTxError(null);

    // 담보/대여 금액 증감에 따라 다른 트랜잭션 스텝
    let steps: TxStep[];

    if (isBorrow) {
      if (collateralDiff < 0) {
        // 담보 감소: 역방향 프로세스
        const reduceAmount = Math.abs(collateralDiff);
        steps = [
          { id: 'verify', label: '상품 정보 확인', status: 'active' },
          { id: 'burn', label: `담보토큰 ${reduceAmount}주 Burn`, status: 'pending' },
          { id: 'legacy_event', label: '레거시 시스템 이벤트 수신', status: 'pending' },
          { id: 'pledge_release', label: '질권 일부 해제', status: 'pending' },
          {
            id: 'stock_return',
            label: `담보 주식 ${reduceAmount}주 유저에게 반환`,
            status: 'pending',
          },
        ];
      } else if (collateralDiff > 0) {
        // 담보 증가: 정방향 프로세스
        steps = [
          { id: 'legacy', label: '유저계좌 확인', status: 'active' },
          { id: 'pledge', label: `추가 담보 ${collateralDiff}주 질권설정`, status: 'pending' },
          { id: 'tokenize', label: `담보 → ${stock?.symbol} 토큰 발행`, status: 'pending' },
          { id: 'tx', label: '담보 토큰 전송 완료', status: 'pending' },
        ];
      } else {
        // 담보 변동 없음 (이자율/만기만 변경)
        steps = [
          { id: 'verify', label: '상품 정보 확인', status: 'active' },
          { id: 'update', label: '상품 조건 업데이트 완료', status: 'pending' },
        ];
      }
    } else {
      if (cashDiff < 0) {
        // 대여 금액 감소: 역방향 프로세스
        const reduceAmount = Math.abs(cashDiff);
        steps = [
          { id: 'verify', label: '상품 정보 확인', status: 'active' },
          {
            id: 'token_transfer',
            label: `dKRW ${reduceAmount.toLocaleString()}원 reserveWallet으로 전송`,
            status: 'pending',
          },
          { id: 'burn', label: '수신된 dKRW Burn 요청', status: 'pending' },
          { id: 'legacy_event', label: '레거시 시스템 이벤트 수신', status: 'pending' },
          { id: 'bond_update', label: '채권 수정', status: 'pending' },
          {
            id: 'tx',
            label: `유저 계좌에 ${reduceAmount.toLocaleString()}원 전송`,
            status: 'pending',
          },
          { id: 'settle', label: '계좌 정산 완료', status: 'pending' },
        ];
      } else if (cashDiff > 0) {
        // 대여 금액 증가: 정방향 프로세스
        steps = [
          { id: 'legacy', label: '유저계좌 확인', status: 'active' },
          { id: 'bond_update', label: '채권 수정', status: 'pending' },
          {
            id: 'tokenize',
            label: `추가 원화 ${cashDiff.toLocaleString()}원 → dKRW 토큰 발행`,
            status: 'pending',
          },
          { id: 'transfer', label: 'dKRW 토큰 전송 완료', status: 'pending' },
        ];
      } else {
        // 대여 금액 변동 없음 (이자율/만기/담보종류만 변경)
        steps = [
          { id: 'verify', label: '상품 정보 확인', status: 'active' },
          { id: 'bond_update', label: '채권 수정', status: 'pending' },
          { id: 'update', label: '상품 조건 업데이트 완료', status: 'pending' },
        ];
      }
    }

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

      // ETH 잔액 확인 및 전송
      await ensureEthBalance(userAddress);

      if (isBorrow) {
        // Borrow offer 수정 - 컨트랙트 호출
        const interestRateBps = BigInt(Math.round(rate * 100)); // % to bps
        const duration = BigInt(maturityDays * 24 * 60 * 60); // days to seconds
        const earlyRepayFeeBps = BigInt(100); // 1%
        const newCollateralAmountInWei = parseUnits(newCollateralAmount.toString(), 18);
        const newLoanAmountInWei = parseUnits(newLoanAmount.toString(), 18);

        // steps 순서대로 진행
        if (collateralDiff > 0) {
          // 담보 증가: legacy → pledge → tokenize → approve → update

          // Step 1: 레거시 시스템 연동 (유저계좌 확인)
          const legacyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, legacyDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'legacy'
                ? { ...s, status: 'complete' }
                : s.id === 'pledge'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 2: 추가 담보 질권설정 (시뮬레이션)
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

          // Step 3: 추가 담보 → 담보 토큰 발행 (Master Mint)
          const additionalAmount = parseUnits(collateralDiff.toString(), 18);
          await mintTokenByMaster('collateral', userAddress, additionalAmount);
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'tokenize'
                ? { ...s, status: 'complete' }
                : s.id === 'tx'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 4: 담보 토큰 Approve (백그라운드에서 처리)
          await approveTokenForLending('collateral', additionalAmount, user.id);

          // Step 5: updateBorrowOffer (담보 토큰 전송 완료)
          const offerId =
            'onChainId' in borrowOffer && typeof borrowOffer.onChainId === 'bigint'
              ? borrowOffer.onChainId
              : BigInt(borrowOffer.id);
          const hash = await updateBorrowOfferContract(
            {
              offerId,
              newCollateralAmount: newCollateralAmountInWei,
              newLoanAmount: newLoanAmountInWei,
              newInterestRateBps: interestRateBps,
              newDuration: duration,
              newEarlyRepayFeeBps: earlyRepayFeeBps,
            },
            user.id,
          );
          setTxHash(hash);
          setTxSteps((prev) => prev.map((s) => (s.id === 'tx' ? { ...s, status: 'complete' } : s)));

          // 추가 담보 주식 차감
          if (stock) {
            updateUserStocks(stock.symbol, -collateralDiff);
          }
        } else if (collateralDiff < 0) {
          // 담보 감소: verify → burn → legacy_event → pledge_release → stock_return → update

          // Step 1: 상품 정보 확인
          const verifyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, verifyDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'verify'
                ? { ...s, status: 'complete' }
                : s.id === 'burn'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 2: 담보토큰 Burn (시뮬레이션)
          const burnDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, burnDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'burn'
                ? { ...s, status: 'complete' }
                : s.id === 'legacy_event'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Burn 완료 후 담보 주식 반환
          if (stock) {
            updateUserStocks(stock.symbol, Math.abs(collateralDiff));
          }

          // Step 3: 레거시 시스템 이벤트 수신 (시뮬레이션)
          const legacyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, legacyDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'legacy_event'
                ? { ...s, status: 'complete' }
                : s.id === 'pledge_release'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 4: 질권 일부 해제 (시뮬레이션)
          const pledgeReleaseDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, pledgeReleaseDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'pledge_release'
                ? { ...s, status: 'complete' }
                : s.id === 'stock_return'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 5: 담보 주식 유저에게 반환 (시뮬레이션) 및 updateBorrowOffer
          const stockReturnDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, stockReturnDelay));
          const offerId =
            'onChainId' in borrowOffer && typeof borrowOffer.onChainId === 'bigint'
              ? borrowOffer.onChainId
              : BigInt(borrowOffer.id);
          const hash = await updateBorrowOfferContract(
            {
              offerId,
              newCollateralAmount: newCollateralAmountInWei,
              newLoanAmount: newLoanAmountInWei,
              newInterestRateBps: interestRateBps,
              newDuration: duration,
              newEarlyRepayFeeBps: earlyRepayFeeBps,
            },
            user.id,
          );
          setTxHash(hash);
          setTxSteps((prev) =>
            prev.map((s) => (s.id === 'stock_return' ? { ...s, status: 'complete' } : s)),
          );
        } else {
          // 담보 변동 없음: verify → update

          // Step 1: 상품 정보 확인
          const verifyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, verifyDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'verify'
                ? { ...s, status: 'complete' }
                : s.id === 'update'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 2: 상품 조건 업데이트 (updateBorrowOffer)
          const offerId =
            'onChainId' in borrowOffer && typeof borrowOffer.onChainId === 'bigint'
              ? borrowOffer.onChainId
              : BigInt(borrowOffer.id);
          const hash = await updateBorrowOfferContract(
            {
              offerId,
              newCollateralAmount: newCollateralAmountInWei,
              newLoanAmount: newLoanAmountInWei,
              newInterestRateBps: interestRateBps,
              newDuration: duration,
              newEarlyRepayFeeBps: earlyRepayFeeBps,
            },
            user.id,
          );
          setTxHash(hash);
          setTxSteps((prev) =>
            prev.map((s) => (s.id === 'update' ? { ...s, status: 'complete' } : s)),
          );
        }

        // 모든 스텝 완료
        setIsComplete(true);
      } else {
        // 유저 주소 확인
        if (!user) {
          throw new Error('No user logged in');
        }
        const userAddress = getCustodyWalletAddress(user.id);
        if (!userAddress) {
          throw new Error('No custody wallet found');
        }

        // ETH 잔액 확인 및 전송
        await ensureEthBalance(userAddress);

        // Lend offer 수정 - 컨트랙트 호출
        const interestRateBps = BigInt(Math.round(rate * 100)); // % to bps
        const duration = BigInt(maturityDays * 24 * 60 * 60); // days to seconds
        const earlyRepayFeeBps = BigInt(100); // 1%
        const newLoanAmountInWei = parseUnits(newCashAmount.toString(), 18);

        // steps 순서대로 진행
        if (cashDiff > 0) {
          // 대여 금액 증가: legacy → bond_update → tokenize → transfer

          // Step 1: 레거시 시스템 연동 (유저계좌 확인)
          const legacyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, legacyDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'legacy'
                ? { ...s, status: 'complete' }
                : s.id === 'bond_update'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 2: 채권 수정 (시뮬레이션)
          const bondUpdateDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, bondUpdateDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'bond_update'
                ? { ...s, status: 'complete' }
                : s.id === 'tokenize'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 3: 추가 원화 → dKRW 토큰 발행 (Master Mint)
          const additionalAmount = parseUnits(cashDiff.toString(), 18);
          await mintTokenByMaster('lend', userAddress, additionalAmount);
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'tokenize'
                ? { ...s, status: 'complete' }
                : s.id === 'transfer'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 4: dKRW 토큰 Approve 및 전송 완료 (updateLendOffer)
          await approveTokenForLending('lend', additionalAmount, user.id);
          const hash = await updateLendOfferContract(
            {
              offerId: BigInt(lendOffer.id),
              newLoanAmount: newLoanAmountInWei,
              newInterestRateBps: interestRateBps,
              newDuration: duration,
              newEarlyRepayFeeBps: earlyRepayFeeBps,
            },
            user.id,
          );
          setTxHash(hash);
          setTxSteps((prev) =>
            prev.map((s) => (s.id === 'transfer' ? { ...s, status: 'complete' } : s)),
          );

          // 추가 대여 원화 차감
          updateUserCash(-cashDiff);
        } else if (cashDiff < 0) {
          // 대여 금액 감소: verify → token_transfer → burn → legacy_event → bond_update → tx → settle

          // Step 1: 상품 정보 확인
          const verifyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, verifyDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'verify'
                ? { ...s, status: 'complete' }
                : s.id === 'token_transfer'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 2: dKRW reserveWallet으로 전송 (시뮬레이션)
          const tokenTransferDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, tokenTransferDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'token_transfer'
                ? { ...s, status: 'complete' }
                : s.id === 'burn'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 3: 수신된 dKRW Burn 요청 (시뮬레이션)
          const burnDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, burnDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'burn'
                ? { ...s, status: 'complete' }
                : s.id === 'legacy_event'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Burn 완료 후 대여 원화 반환
          updateUserCash(Math.abs(cashDiff));

          // Step 4: 레거시 시스템 이벤트 수신 (시뮬레이션)
          const legacyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, legacyDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'legacy_event'
                ? { ...s, status: 'complete' }
                : s.id === 'bond_update'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 5: 채권 수정 (시뮬레이션)
          await new Promise((resolve) => setTimeout(resolve, 1000));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'bond_update'
                ? { ...s, status: 'complete' }
                : s.id === 'tx'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 6: 유저 계좌에 원 전송 및 updateLendOffer
          const hash = await updateLendOfferContract(
            {
              offerId: BigInt(lendOffer.id),
              newLoanAmount: newLoanAmountInWei,
              newInterestRateBps: interestRateBps,
              newDuration: duration,
              newEarlyRepayFeeBps: earlyRepayFeeBps,
            },
            user.id,
          );
          setTxHash(hash);
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'tx'
                ? { ...s, status: 'complete' }
                : s.id === 'settle'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 7: 계좌 정산 완료
          const settleDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, settleDelay));
          setTxSteps((prev) =>
            prev.map((s) => (s.id === 'settle' ? { ...s, status: 'complete' } : s)),
          );
        } else {
          // 대여 금액 변동 없음: verify → bond_update → update

          // Step 1: 상품 정보 확인
          const verifyDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, verifyDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'verify'
                ? { ...s, status: 'complete' }
                : s.id === 'bond_update'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 2: 채권 수정 (시뮬레이션)
          const bondUpdateDelay = Math.floor(Math.random() * 1000) + 4000; // 4000~5000ms
          await new Promise((resolve) => setTimeout(resolve, bondUpdateDelay));
          setTxSteps((prev) =>
            prev.map((s) =>
              s.id === 'bond_update'
                ? { ...s, status: 'complete' }
                : s.id === 'update'
                ? { ...s, status: 'active' }
                : s,
            ),
          );

          // Step 3: 상품 조건 업데이트 (updateLendOffer)
          const hash = await updateLendOfferContract(
            {
              offerId: BigInt(lendOffer.id),
              newLoanAmount: newLoanAmountInWei,
              newInterestRateBps: interestRateBps,
              newDuration: duration,
              newEarlyRepayFeeBps: earlyRepayFeeBps,
            },
            user.id,
          );
          setTxHash(hash);
          setTxSteps((prev) =>
            prev.map((s) => (s.id === 'update' ? { ...s, status: 'complete' } : s)),
          );
        }

        // 모든 스텝 완료
        setIsComplete(true);
      }
    } catch (error) {
      console.error('Update offer failed:', error);
      setTxError(error instanceof Error ? error.message : '상품 수정 실패');
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
    onClose();
  };

  if (showTx) {
    return (
      <TransactionModal
        open={showTx}
        onClose={handleClose}
        title={isBorrow ? '대출 상품 수정' : '대여 상품 수정'}
        steps={txSteps}
        txHash={txHash}
        isComplete={isComplete}
        error={txError}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isBorrow ? '대출 상품 수정' : '대여 상품 수정'}</DialogTitle>
          <DialogDescription>
            {isBorrow
              ? '담보 수량, 대출 금액, 이자율, 만기를 수정할 수 있습니다. 담보 종류는 변경할 수 없습니다.'
              : '대여 금액, 요청 담보, 이자율, 만기를 수정할 수 있습니다. 대여 통화(원화)는 변경할 수 없습니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isBorrow ? (
            <>
              {/* 담보 종류 (수정 불가) */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">담보 종류 (수정 불가)</Label>
                <div className="flex items-center gap-2 rounded-lg border bg-secondary/50 p-3">
                  <span className="text-xl">{stock?.icon}</span>
                  <span className="font-medium">{stock?.name}</span>
                  <span className="ml-auto text-sm text-muted-foreground">
                    현재가: ₩{stockPrice.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* 담보 수량 */}
              <div className="space-y-2">
                <Label>담보 수량</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={collateralAmount}
                    onChange={(e) => setCollateralAmount(e.target.value)}
                    placeholder="0"
                    min="1"
                    max={maxCollateralAvailable}
                  />
                  <span className="text-sm text-muted-foreground">주</span>
                </div>
                <div className="flex gap-2">
                  {percentButtons.map((percent) => (
                    <Button
                      key={percent}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => handleCollateralPercent(percent)}
                    >
                      {percent}%
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  사용 가능: {maxCollateralAvailable}주 (보유 {currentStockBalance}주 + 기존 등록{' '}
                  {originalCollateralAmount}주)
                </p>
                {collateralValue > 0 && (
                  <p className="text-sm text-primary">
                    담보 가치: ₩{collateralValue.toLocaleString()}
                  </p>
                )}
              </div>

              {/* 대출 희망 금액 */}
              <div className="space-y-2">
                <Label>대출 희망 금액 (원화)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="0"
                    className="pr-16"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs font-semibold text-primary hover:text-primary/80"
                    onClick={() => setLoanAmount(Math.floor(maxLoanAmount).toString())}
                  >
                    MAX
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  최대 대출 가능 (LTV {maxLtv * 100}%): ₩{maxLoanAmount.toLocaleString()}
                </p>
                {newLoanAmount > 0 && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm ${
                        !isLtvValid
                          ? 'text-red-500'
                          : currentLtv > 60
                          ? 'text-yellow-500'
                          : 'text-primary'
                      }`}
                    >
                      현재 LTV: {currentLtv.toFixed(1)}%
                    </span>
                    {!isLtvValid && (
                      <span className="flex items-center gap-1 text-xs text-red-500">
                        <AlertTriangle className="h-3 w-3" />
                        LTV 한도 초과
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* 대여 통화 (수정 불가) */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">대여 통화 (수정 불가)</Label>
                <div className="flex items-center gap-2 rounded-lg border bg-secondary/50 p-3">
                  <span className="text-xl">🇰🇷</span>
                  <span className="font-medium">원화 (KRW)</span>
                </div>
              </div>

              {/* 대여 금액 */}
              <div className="space-y-2">
                <Label>대여 금액</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">원</span>
                </div>
                <div className="flex gap-2">
                  {percentButtons.map((percent) => (
                    <Button
                      key={percent}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => handleCashPercent(percent)}
                    >
                      {percent}%
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  사용 가능: ₩{maxCashAvailable.toLocaleString()} (보유 ₩
                  {currentCashBalance.toLocaleString()} + 기존 등록 ₩
                  {originalCashAmount.toLocaleString()})
                </p>
              </div>

              {/* 요청 담보 */}
              <div className="space-y-2">
                <Label>요청 담보 종류</Label>
                <Select
                  value={requestedCollateralStock}
                  onValueChange={setRequestedCollateralStock}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="담보로 받을 주식 선택" />
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
            </>
          )}

          {/* 이자율 */}
          <div className="space-y-2">
            <Label>연 이자율 (%)</Label>
            <div className="relative">
              <Input
                type="number"
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
                placeholder="0"
                step="0.1"
                min="0"
                max="30"
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>

          {/* 만기 */}
          <div className="space-y-2">
            <Label>만기</Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '1개월', days: 30 },
                { label: '3개월', days: 90 },
                { label: '6개월', days: 180 },
                { label: '1년', days: 365 },
              ].map((option) => (
                <Button
                  key={option.days}
                  type="button"
                  variant={maturityDays === option.days ? 'default' : 'outline'}
                  size="sm"
                  className={maturityDays === option.days ? '' : 'bg-transparent'}
                  onClick={() => setMaturityDays(option.days)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={
              isBorrow
                ? newCollateralAmount <= 0 || newLoanAmount <= 0 || !isLtvValid
                : newCashAmount <= 0 || !requestedCollateralStock
            }
          >
            상품 수정
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
