'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { lendingViewerAbi } from '../contracts/abis/lendingViewer';
import { CONTRACTS, getCollateralTokenByAddress, getLendTokenByAddress } from '../contracts/config';
import { getCustodyWalletAddress } from '../wallet/custody';
import { useStore } from '../store';
import { OfferState } from '../contracts/lending';
import type { UIBorrowOffer, UILendOffer } from './useOffersWagmi';

// ============ Helpers ============

function offerStateToString(
  state: number,
): 'active' | 'matched' | 'closed' | 'cancelled' | 'liquidated' {
  switch (state) {
    case OfferState.Active:
      return 'active';
    case OfferState.Matched:
      return 'matched';
    case OfferState.Closed:
      return 'closed';
    case OfferState.Cancelled:
      return 'cancelled';
    case OfferState.Liquidated:
      return 'liquidated';
    default:
      return 'active';
  }
}

function bpsToPercent(bps: bigint): number {
  return Number(bps) / 100;
}

function durationToDays(duration: bigint): number {
  return Math.ceil(Number(duration) / 86400);
}

function formatTokenAmount(amount: bigint, decimals: number = 18): number {
  return Number(formatUnits(amount, decimals));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformBorrowOffer(offer: any): UIBorrowOffer {
  const collateralToken = getCollateralTokenByAddress(offer.collateralToken);
  const lendToken = getLendTokenByAddress(offer.lendToken);

  const collateralAmount = formatTokenAmount(offer.collateralAmount);
  const loanAmount = formatTokenAmount(offer.loanAmount);
  const ltv = collateralAmount > 0 ? (loanAmount / collateralAmount) * 100 : 0;

  let stateValue = offer.state;
  if (stateValue === undefined || stateValue === null || Number(stateValue) === 0) {
    if (Array.isArray(offer) && offer[16] !== undefined) {
      stateValue = offer[16];
    }
    if (stateValue === undefined || stateValue === null || Number(stateValue) === 0) {
      stateValue = 1;
    }
  }

  const stateNum = Number(stateValue);

  return {
    id: offer.id.toString(),
    onChainId: offer.id,
    borrower: offer.borrower,
    borrowerWallet: offer.borrower,
    lender: offer.lender === '0x0000000000000000000000000000000000000000' ? null : offer.lender,
    collateralStock: collateralToken?.symbol || 'UNKNOWN',
    collateralTokenAddress: offer.collateralToken,
    collateralAmount,
    loanCurrency: lendToken?.symbol || 'dKRW',
    lendTokenAddress: offer.lendToken,
    loanAmount,
    interestRate: bpsToPercent(offer.interestRateBps),
    maturityDays: durationToDays(offer.duration),
    ltv,
    status: offerStateToString(stateNum),
    createdAt: Number(offer.createdAt) * 1000,
    matchedAt: offer.matchedAt > BigInt(0) ? Number(offer.matchedAt) * 1000 : undefined,
    expiresAt: offer.expiresAt > BigInt(0) ? Number(offer.expiresAt) * 1000 : undefined,
    principalDebt: formatTokenAmount(offer.principalDebt),
    accruedInterest: 0,
    healthFactor: 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformLendOffer(offer: any): UILendOffer {
  const collateralToken = getCollateralTokenByAddress(offer.collateralToken);
  const lendToken = getLendTokenByAddress(offer.lendToken);

  let stateValue = offer.state;
  if (stateValue === undefined || stateValue === null || Number(stateValue) === 0) {
    // 배열인 경우 인덱스로 접근 시도 (state는 14번째, 인덱스 14)
    if (Array.isArray(offer) && offer[14] !== undefined) {
      stateValue = offer[14];
    }
    if (stateValue === undefined || stateValue === null || Number(stateValue) === 0) {
      stateValue = 1;
    }
  }

  const stateNum = Number(stateValue);

  return {
    id: offer.id.toString(),
    onChainId: offer.id,
    lender: offer.lender,
    lenderWallet: offer.lender,
    borrower:
      offer.borrower === '0x0000000000000000000000000000000000000000' ? null : offer.borrower,
    requestedCollateralStock: collateralToken?.symbol || 'UNKNOWN',
    collateralTokenAddress: offer.collateralToken,
    collateralAmount: formatTokenAmount(offer.collateralAmount),
    loanCurrency: lendToken?.symbol || 'dKRW',
    lendTokenAddress: offer.lendToken,
    loanAmount: formatTokenAmount(offer.loanAmount),
    interestRate: bpsToPercent(offer.interestRateBps),
    maturityDays: durationToDays(offer.duration),
    status: offerStateToString(stateNum),
    createdAt: Number(offer.createdAt) * 1000,
    matchedAt: offer.matchedAt > BigInt(0) ? Number(offer.matchedAt) * 1000 : undefined,
    expiresAt: offer.expiresAt > BigInt(0) ? Number(offer.expiresAt) * 1000 : undefined,
    borrowOfferId: offer.borrowOfferId !== undefined && offer.borrowOfferId > BigInt(0) ? offer.borrowOfferId : undefined,
  };
}

// ============ Hooks ============

// 유저의 Borrow Positions 조회 (borrower로서)
export function useUserBorrowPositions(stateFilter: OfferState = OfferState.None) {
  const { user } = useStore();
  const walletAddress = user ? getCustodyWalletAddress(user.id) : undefined;

  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getBorrowPositions',
    args: walletAddress ? [walletAddress as `0x${string}`, stateFilter] : undefined,
    query: {
      enabled: !!walletAddress,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positionsArray: any[] = Array.isArray(rawData) ? rawData : rawData?.[0] || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positions: UIBorrowOffer[] = positionsArray.map(transformBorrowOffer);

  return {
    positions,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}

// 유저의 Lend Positions 조회 (lender로서 만든 lend offers)
export function useUserLendPositions(stateFilter: OfferState = OfferState.None) {
  const { user } = useStore();
  const walletAddress = user ? getCustodyWalletAddress(user.id) : undefined;

  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getLendPositions',
    args: walletAddress ? [walletAddress as `0x${string}`, stateFilter] : undefined,
    query: {
      enabled: !!walletAddress,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positionsArray: any[] = Array.isArray(rawData) ? rawData : rawData?.[0] || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positions: UILendOffer[] = positionsArray.map(transformLendOffer);

  return {
    positions,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}

// 유저가 lender로서 참여한 Borrow Offers 조회 (대출 상품에 매칭한 경우)
export function useLenderLoanPositions(stateFilter: OfferState = OfferState.None) {
  const { user } = useStore();
  const walletAddress = user ? getCustodyWalletAddress(user.id) : undefined;

  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getLenderLoanPositions',
    args: walletAddress ? [walletAddress as `0x${string}`, stateFilter] : undefined,
    query: {
      enabled: !!walletAddress,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positionsArray: any[] = Array.isArray(rawData) ? rawData : rawData?.[0] || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positions: UIBorrowOffer[] = positionsArray.map(transformBorrowOffer);

  return {
    positions,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}

// 유저가 borrower로서 참여한 Lend Offers 조회 (대여 상품에 매칭한 경우)
export function useBorrowerLendPositions(stateFilter: OfferState = OfferState.None) {
  const { user } = useStore();
  const walletAddress = user ? getCustodyWalletAddress(user.id) : undefined;

  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getBorrowerLendOffers',
    args: walletAddress ? [walletAddress as `0x${string}`, stateFilter] : undefined,
    query: {
      enabled: !!walletAddress,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positionsArray: any[] = Array.isArray(rawData) ? rawData : rawData?.[0] || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const positions: UILendOffer[] = positionsArray.map(transformLendOffer);

  return {
    positions,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}

