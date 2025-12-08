'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACTS } from '../contracts/config';
import { lendingAbi } from '../contracts/abis/lending';

// Health Factor와 Accrued Interest를 조회하는 훅
export function usePositionDataWagmi(offerId: bigint | null) {
  const { data: healthFactor, isLoading: hfLoading, error: hfError } = useReadContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'currentHealthFactor',
    args: offerId !== null ? [offerId] : undefined,
    query: {
      enabled: offerId !== null,
      refetchInterval: 2000, // 2초마다 자동 갱신
      staleTime: 1000,
    },
  });

  const { data: accruedInterest, isLoading: aiLoading, error: aiError } = useReadContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'accruedInterest',
    args: offerId !== null ? [offerId] : undefined,
    query: {
      enabled: offerId !== null,
      refetchInterval: 2000, // 2초마다 자동 갱신
      staleTime: 1000,
    },
  });

  // Health Factor는 컨트랙트에서 bps (basis points) 형식으로 반환됨 (예: 16679 = 1.6679)
  // 10000으로 나눠서 실제 값으로 변환
  let parsedHealthFactor = 0;
  if (healthFactor !== undefined && healthFactor !== null) {
    const hfValue = Number(healthFactor);
    // bps 형식이므로 10000으로 나눔 (예: 16679 / 10000 = 1.6679)
    parsedHealthFactor = hfValue / 10000;
  }

  return {
    healthFactor: parsedHealthFactor,
    accruedInterest: accruedInterest ? Number(formatUnits(accruedInterest, 18)) : 0,
    loading: hfLoading || aiLoading,
    error: hfError || aiError,
  };
}

