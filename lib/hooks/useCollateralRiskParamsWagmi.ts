'use client';

import { useReadContracts } from 'wagmi';
import { lendingAbi } from '../contracts/abis/lending';
import { CONTRACTS, mapCollateralTokens, getCollateralTokenByAddress } from '../contracts/config';
import { useAllowedCollateralTokensWagmi } from './useAllowedTokensWagmi';

export interface CollateralRiskParams {
  maxLtvBps: bigint;
  liquidationBps: bigint;
  liquidationPenaltyBps: bigint;
}

export interface CollateralRiskParamsMap {
  [key: string]: CollateralRiskParams; // 주소 또는 symbol로 접근 가능
}

export function useCollateralRiskParamsWagmi() {
  // 온체인에서 허용된 담보 토큰 목록 조회
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 모든 담보 토큰에 대한 risk params 조회 요청 생성
  const contracts = collateralTokenAddresses.map((tokenAddress) => ({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'collateralRiskParams',
    args: [tokenAddress],
  }));

  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: collateralTokenAddresses.length > 0,
      refetchInterval: 1500, // 1.5초마다 자동 갱신
      staleTime: 1000,
    },
  });

  // 결과를 CollateralRiskParamsMap 형태로 변환
  const riskParams: CollateralRiskParamsMap = {};

  if (data) {
    const collateralTokens = mapCollateralTokens(collateralTokenAddresses);
    collateralTokenAddresses.forEach((tokenAddress, index) => {
      const result = data[index];
      const addressLower = tokenAddress.toLowerCase();
      if (result.status === 'success' && result.result !== undefined) {
        const resultData = result.result as unknown;
        const [maxLtvBps, liquidationBps, liquidationPenaltyBps] = (
          Array.isArray(resultData) ? resultData : []
        ) as [bigint, bigint, bigint];
        const params: CollateralRiskParams = {
          maxLtvBps,
          liquidationBps,
          liquidationPenaltyBps,
        };
        // 주소로 저장
        riskParams[addressLower] = params;
        riskParams[tokenAddress] = params;

        // symbol로도 저장 (하위 호환성)
        const tokenInfo = getCollateralTokenByAddress(tokenAddress);
        if (tokenInfo) {
          riskParams[tokenInfo.symbol] = params;
        }
      } else {
        // 기본값 설정 (에러 시)
        const defaultParams: CollateralRiskParams = {
          maxLtvBps: BigInt(7000), // 70% 기본값
          liquidationBps: BigInt(8000), // 80% 기본값
          liquidationPenaltyBps: BigInt(500), // 5% 기본값
        };
        riskParams[addressLower] = defaultParams;
        riskParams[tokenAddress] = defaultParams;

        // symbol로도 저장
        const tokenInfo = getCollateralTokenByAddress(tokenAddress);
        if (tokenInfo) {
          riskParams[tokenInfo.symbol] = defaultParams;
        }
      }
    });
  }

  return {
    riskParams,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}
