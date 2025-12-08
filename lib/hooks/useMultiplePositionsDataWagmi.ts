'use client';

import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACTS } from '../contracts/config';
import { lendingAbi } from '../contracts/abis/lending';

export interface PositionData {
  offerId: bigint;
  healthFactor: number;
  accruedInterest: number;
}

/**
 * 여러 포지션의 Health Factor와 Accrued Interest를 한 번에 조회하는 hook
 * multicall을 사용하여 모든 포지션 데이터를 하나의 RPC 요청으로 가져옴
 */
export function useMultiplePositionsDataWagmi(offerIds: (bigint | null | undefined)[]) {
  // null이나 undefined가 아닌 유효한 offerId만 필터링
  const validOfferIds = offerIds.filter((id): id is bigint => id !== null && id !== undefined);

  // 각 포지션에 대해 healthFactor와 accruedInterest를 조회하는 contracts 생성
  const contracts = validOfferIds.flatMap((offerId) => [
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
  ]);

  const { data, isLoading, error } = useReadContracts({
    contracts,
    query: {
      enabled: validOfferIds.length > 0,
      refetchInterval: 2000, // 2초마다 자동 갱신
      staleTime: 1000,
    },
  });

  // 결과를 포지션별로 매핑
  const positionsData: Map<bigint, PositionData> = new Map();

  if (data && validOfferIds.length > 0) {
    validOfferIds.forEach((offerId, index) => {
      const healthFactorIndex = index * 2;
      const accruedInterestIndex = index * 2 + 1;

      const healthFactorResult = data[healthFactorIndex];
      const accruedInterestResult = data[accruedInterestIndex];

      let parsedHealthFactor = 0;
      let parsedAccruedInterest = 0;

      if (healthFactorResult?.status === 'success' && healthFactorResult.result !== undefined) {
        const hfValue = Number(healthFactorResult.result);
        // bps 형식이므로 10000으로 나눔 (예: 16679 / 10000 = 1.6679)
        parsedHealthFactor = hfValue / 10000;
      }

      if (
        accruedInterestResult?.status === 'success' &&
        accruedInterestResult.result !== undefined
      ) {
        parsedAccruedInterest = Number(formatUnits(accruedInterestResult.result as bigint, 18));
      }

      positionsData.set(offerId, {
        offerId,
        healthFactor: parsedHealthFactor,
        accruedInterest: parsedAccruedInterest,
      });
    });
  }

  return {
    positionsData,
    loading: isLoading,
    error: error || null,
  };
}
