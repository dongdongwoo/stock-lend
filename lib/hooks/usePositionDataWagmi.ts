'use client';

import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACTS } from '../contracts/config';
import { lendingAbi } from '../contracts/abis/lending';

// Health Factor와 Accrued Interest를 조회하는 훅
// multicall을 사용하여 두 개의 호출을 하나로 묶어 RPC 요청 수를 절반으로 줄임
export function usePositionDataWagmi(offerId: bigint | null) {
  const contracts = offerId !== null
    ? [
        {
          address: CONTRACTS.lending,
          abi: lendingAbi,
          functionName: 'currentHealthFactor' as const,
          args: [offerId] as const,
        },
        {
          address: CONTRACTS.lending,
          abi: lendingAbi,
          functionName: 'accruedInterest' as const,
          args: [offerId] as const,
        },
      ]
    : [];

  const { data, isLoading, error } = useReadContracts({
    contracts,
    query: {
      enabled: offerId !== null,
      refetchInterval: 2000, // 2초마다 자동 갱신
      staleTime: 1000,
    },
  });

  // Health Factor는 컨트랙트에서 bps (basis points) 형식으로 반환됨 (예: 16679 = 1.6679)
  // 10000으로 나눠서 실제 값으로 변환
  let parsedHealthFactor = 0;
  let parsedAccruedInterest = 0;

  if (data && data.length >= 2) {
    // 첫 번째 결과: currentHealthFactor
    const healthFactorResult = data[0];
    if (healthFactorResult.status === 'success' && healthFactorResult.result !== undefined) {
      const hfValue = Number(healthFactorResult.result);
      // bps 형식이므로 10000으로 나눔 (예: 16679 / 10000 = 1.6679)
      parsedHealthFactor = hfValue / 10000;
    }

    // 두 번째 결과: accruedInterest
    const accruedInterestResult = data[1];
    if (accruedInterestResult.status === 'success' && accruedInterestResult.result !== undefined) {
      parsedAccruedInterest = Number(formatUnits(accruedInterestResult.result as bigint, 18));
    }
  }

  return {
    healthFactor: parsedHealthFactor,
    accruedInterest: parsedAccruedInterest,
    loading: isLoading,
    error: error || null,
  };
}

