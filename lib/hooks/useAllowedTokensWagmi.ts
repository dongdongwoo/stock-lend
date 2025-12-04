'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS } from '../contracts/config';
import { lendingAbi } from '../contracts/abis/lending';

/**
 * 온체인에서 허용된 담보 토큰 목록을 조회하는 hook
 */
export function useAllowedCollateralTokensWagmi() {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'getAllowedCollateralTokens',
    query: {
      refetchInterval: 30000, // 30초마다 자동 갱신
      staleTime: 10000,
    },
  });

  return {
    tokens: (data as `0x${string}`[] | undefined) || [],
    isLoading,
    isError,
    error,
    refetch,
  };
}

/**
 * 온체인에서 허용된 대여 토큰 목록을 조회하는 hook
 */
export function useAllowedLendTokensWagmi() {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'getAllowedLendTokens',
    query: {
      refetchInterval: 30000, // 30초마다 자동 갱신
      staleTime: 10000,
    },
  });

  return {
    tokens: (data as `0x${string}`[] | undefined) || [],
    isLoading,
    isError,
    error,
    refetch,
  };
}

