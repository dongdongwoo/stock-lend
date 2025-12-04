'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatUnits } from 'viem';
import {
  getAllBorrowOffers,
  getAllLendOffers,
  getUserBorrowPositions,
  getUserLendPositions,
  getAccruedInterest,
  getHealthFactor,
  type BorrowOffer as ContractBorrowOffer,
  type LendOffer as ContractLendOffer,
  OfferState,
} from '../contracts/lending';
import { getPrice } from '../contracts/oracle';
import { getTokenBalance } from '../contracts/tokens';
import {
  CONTRACTS,
  COLLATERAL_TOKENS,
  getCollateralTokenByAddress,
  getLendTokenByAddress,
  BPS_DENOMINATOR,
  mapCollateralTokens,
  mapLendTokens,
} from '../contracts/config';
import {
  useAllowedCollateralTokensWagmi,
  useAllowedLendTokensWagmi,
} from './useAllowedTokensWagmi';
import { getCustodyWalletAddress } from '../wallet/custody';
import type { UIBorrowOffer, UILendOffer } from './types';

// Re-export types for convenience
export type { UIBorrowOffer, UILendOffer } from './types';

export interface OraclePrices {
  [tokenAddress: string]: number;
  lastUpdated: number;
}

export interface TokenBalances {
  collateral: { [address: string]: number };
  lend: { [address: string]: number };
  eth: number;
}

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
  return Number(bps) / 100; // 100 bps = 1%
}

function durationTodays(duration: bigint): number {
  return Math.ceil(Number(duration) / 86400); // seconds to days
}

function formatTokenAmount(amount: bigint, decimals: number = 18): number {
  return Number(formatUnits(amount, decimals));
}

// ============ Transform Functions ============

function transformBorrowOffer(offer: ContractBorrowOffer): UIBorrowOffer {
  const collateralToken = getCollateralTokenByAddress(offer.collateralToken);
  const lendToken = getLendTokenByAddress(offer.lendToken);

  const collateralAmount = formatTokenAmount(offer.collateralAmount);
  const loanAmount = formatTokenAmount(offer.loanAmount);

  // LTV 계산 (collateralValue가 필요하지만 여기서는 단순화)
  const ltv = collateralAmount > 0 ? (loanAmount / collateralAmount) * 100 : 0;

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
    maturityDays: durationTodays(offer.duration),
    ltv,
    status: offerStateToString(offer.state),
    createdAt: Number(offer.createdAt) * 1000,
    matchedAt: offer.matchedAt > BigInt(0) ? Number(offer.matchedAt) * 1000 : undefined,
    expiresAt: offer.expiresAt > BigInt(0) ? Number(offer.expiresAt) * 1000 : undefined,
    principalDebt: formatTokenAmount(offer.principalDebt),
    accruedInterest: 0, // 별도 조회 필요
    healthFactor: 0, // 별도 조회 필요
  };
}

function transformLendOffer(offer: ContractLendOffer): UILendOffer {
  const collateralToken = getCollateralTokenByAddress(offer.collateralToken);
  const lendToken = getLendTokenByAddress(offer.lendToken);

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
    maturityDays: durationTodays(offer.duration),
    status: offerStateToString(offer.state),
    createdAt: Number(offer.createdAt) * 1000,
    matchedAt: offer.matchedAt > BigInt(0) ? Number(offer.matchedAt) * 1000 : undefined,
    expiresAt: offer.expiresAt > BigInt(0) ? Number(offer.expiresAt) * 1000 : undefined,
  };
}

// ============ Hooks ============

// 모든 Borrow Offers 조회 (자동 폴링 지원)
export function useBorrowOffers(pollingInterval: number = 1500) {
  const [offers, setOffers] = useState<UIBorrowOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllBorrowOffers();
      const transformed = data.map(transformBorrowOffer);
      setOffers(transformed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch borrow offers'));
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    refetch();
  }, [refetch]);

  // 폴링 (주기적 자동 갱신)
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const intervalId = setInterval(() => {
      refetch();
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [pollingInterval, refetch]);

  return { offers, loading, error, refetch };
}

// 모든 Lend Offers 조회 (자동 폴링 지원)
export function useLendOffers(pollingInterval: number = 1500) {
  const [offers, setOffers] = useState<UILendOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllLendOffers();
      const transformed = data.map(transformLendOffer);
      setOffers(transformed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch lend offers'));
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    refetch();
  }, [refetch]);

  // 폴링 (주기적 자동 갱신)
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const intervalId = setInterval(() => {
      refetch();
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [pollingInterval, refetch]);

  return { offers, loading, error, refetch };
}

// 오라클 가격 조회 (자동 폴링 지원)
export function useOraclePrices(pollingInterval: number = 1500) {
  const [prices, setPrices] = useState<OraclePrices>({ lastUpdated: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 온체인에서 허용된 토큰 목록 조회
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();
  const { tokens: lendTokenAddresses } = useAllowedLendTokensWagmi();

  // 온체인 토큰 목록을 토큰 정보로 변환
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);
  const lendTokens = mapLendTokens(lendTokenAddresses);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const newPrices: OraclePrices = { lastUpdated: Date.now() };

      // 담보 토큰 가격 조회 (온체인 목록 사용)
      for (const token of collateralTokens) {
        try {
          const price = await getPrice(token.address);
          newPrices[token.address.toLowerCase()] = formatTokenAmount(price);
          newPrices[token.symbol] = formatTokenAmount(price);
        } catch {
          // 가격이 설정되지 않은 경우 기본값
          newPrices[token.address.toLowerCase()] = 0;
          newPrices[token.symbol] = 0;
        }
      }

      // 대여 토큰 가격 조회 (dKRW는 1:1, 온체인 목록 사용)
      for (const token of lendTokens) {
        newPrices[token.address.toLowerCase()] = 1;
        newPrices[token.symbol] = 1;
      }

      setPrices(newPrices);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch oracle prices'));
    } finally {
      setLoading(false);
    }
  }, [collateralTokens, lendTokens]);

  // 초기 로드
  useEffect(() => {
    refetch();
  }, [refetch]);

  // 폴링 (주기적 자동 갱신)
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const intervalId = setInterval(() => {
      refetch();
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [pollingInterval, refetch]);

  return { prices, loading, error, refetch };
}

// 유저 토큰 잔액 조회 (자동 폴링 지원)
export function useTokenBalances(pollingInterval: number = 1500) {
  const [balances, setBalances] = useState<TokenBalances>({
    collateral: {},
    lend: {},
    eth: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    // userId는 외부에서 전달받아야 함 - 이 함수는 사용하지 않음
    // useTokenBalancesWagmi를 사용하도록 변경 필요
    setBalances({ collateral: {}, lend: {}, eth: 0 });
    setLoading(false);
  }, []);

  // 초기 로드
  useEffect(() => {
    refetch();
  }, [refetch]);

  // 폴링 (주기적 자동 갱신)
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const intervalId = setInterval(() => {
      refetch();
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [pollingInterval, refetch]);

  return { balances, loading, error, refetch };
}

// 유저의 Borrow Positions 조회 (자동 폴링 지원)
// userId는 외부에서 전달받아야 함 - 이 함수는 사용하지 않음
// useUserBorrowPositionsWagmi를 사용하도록 변경 필요
export function useUserBorrowPositions(stateFilter?: OfferState, pollingInterval: number = 1500) {
  const [positions, setPositions] = useState<UIBorrowOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    // userId는 외부에서 전달받아야 함 - 이 함수는 사용하지 않음
    // useUserBorrowPositionsWagmi를 사용하도록 변경 필요
    setPositions([]);
    setLoading(false);
  }, [stateFilter]);

  // 초기 로드
  useEffect(() => {
    refetch();
  }, [refetch]);

  // 폴링 (주기적 자동 갱신)
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const intervalId = setInterval(() => {
      refetch();
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [pollingInterval, refetch]);

  return { positions, loading, error, refetch };
}

// 유저의 Lend Positions 조회 (자동 폴링 지원)
// userId는 외부에서 전달받아야 함 - 이 함수는 사용하지 않음
// useUserLendPositionsWagmi를 사용하도록 변경 필요
export function useUserLendPositions(stateFilter?: OfferState, pollingInterval: number = 1500) {
  const [positions, setPositions] = useState<UILendOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    // userId는 외부에서 전달받아야 함 - 이 함수는 사용하지 않음
    // useUserLendPositionsWagmi를 사용하도록 변경 필요
    setPositions([]);
    setLoading(false);
  }, [stateFilter]);

  // 초기 로드
  useEffect(() => {
    refetch();
  }, [refetch]);

  // 폴링 (주기적 자동 갱신)
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const intervalId = setInterval(() => {
      refetch();
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [pollingInterval, refetch]);

  return { positions, loading, error, refetch };
}

// 통합 데이터 조회 Hook
export function useContractData() {
  const borrowOffers = useBorrowOffers();
  const lendOffers = useLendOffers();
  const oraclePrices = useOraclePrices();
  const tokenBalances = useTokenBalances();

  const refetchAll = useCallback(() => {
    borrowOffers.refetch();
    lendOffers.refetch();
    oraclePrices.refetch();
    tokenBalances.refetch();
  }, [borrowOffers, lendOffers, oraclePrices, tokenBalances]);

  const loading =
    borrowOffers.loading || lendOffers.loading || oraclePrices.loading || tokenBalances.loading;

  return {
    borrowOffers: borrowOffers.offers,
    lendOffers: lendOffers.offers,
    oraclePrices: oraclePrices.prices,
    tokenBalances: tokenBalances.balances,
    loading,
    refetchAll,
    refetch: {
      borrowOffers: borrowOffers.refetch,
      lendOffers: lendOffers.refetch,
      oraclePrices: oraclePrices.refetch,
      tokenBalances: tokenBalances.refetch,
    },
  };
}
