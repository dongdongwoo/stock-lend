'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS } from '../contracts/config';
import { lendingConfigAbi } from '../contracts/abis/lendingConfig';

/**
 * 온체인에서 허용된 담보 토큰 목록을 조회하는 hook
 */
export function useAllowedCollateralTokensWagmi() {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'getAllowedCollateralTokens',
    query: {
      refetchInterval: 30000, // 30초마다 자동 갱신
      staleTime: 10000,
    },
  });

  // wagmi는 tuple 배열을 반환할 때 { data: ... } 형태로 반환할 수 있음
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  
  // 반환값 처리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokensArray: `0x${string}`[] = [];
  if (rawData) {
    if (Array.isArray(rawData)) {
      tokensArray = rawData as `0x${string}`[];
    } else if (rawData.data && Array.isArray(rawData.data)) {
      tokensArray = rawData.data as `0x${string}`[];
    } else if (rawData[0] && Array.isArray(rawData[0])) {
      tokensArray = rawData[0] as `0x${string}`[];
    }
  }

  // 디버깅
  if (!isLoading) {
    console.log('useAllowedCollateralTokensWagmi:', {
      rawData,
      tokensArray: tokensArray.map((a) => a.toLowerCase()),
      error: error?.message,
      isError,
    });
  }

  return {
    tokens: tokensArray,
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
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'getAllowedLendTokens',
    query: {
      refetchInterval: 30000, // 30초마다 자동 갱신
      staleTime: 10000,
    },
  });

  // wagmi는 tuple 배열을 반환할 때 { data: ... } 형태로 반환할 수 있음
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  
  // 반환값 처리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokensArray: `0x${string}`[] = [];
  if (rawData) {
    if (Array.isArray(rawData)) {
      tokensArray = rawData as `0x${string}`[];
    } else if (rawData.data && Array.isArray(rawData.data)) {
      tokensArray = rawData.data as `0x${string}`[];
    } else if (rawData[0] && Array.isArray(rawData[0])) {
      tokensArray = rawData[0] as `0x${string}`[];
    }
  }

  return {
    tokens: tokensArray,
    isLoading,
    isError,
    error,
    refetch,
  };
}

