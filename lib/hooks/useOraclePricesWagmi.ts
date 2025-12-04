'use client';

import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { oracleAbi } from '../contracts/abis/oracle';
import {
  CONTRACTS,
  TOKEN_ADDRESS_TO_SYMBOL,
  getCollateralTokenByAddress,
  getLendTokenByAddress,
} from '../contracts/config';
import {
  useAllowedCollateralTokensWagmi,
  useAllowedLendTokensWagmi,
} from './useAllowedTokensWagmi';

export interface OraclePrices {
  [key: string]: number;
  lastUpdated: number;
}

export function useOraclePricesWagmi() {
  // 온체인에서 허용된 토큰 목록 조회
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();
  const { tokens: lendTokenAddresses } = useAllowedLendTokensWagmi();

  // 모든 담보 토큰에 대한 가격 조회 요청 생성
  const contracts = collateralTokenAddresses.map((tokenAddress) => ({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'getPrice',
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

  // 결과를 OraclePrices 형태로 변환
  const prices: OraclePrices = { lastUpdated: Date.now() };

  if (data) {
    collateralTokenAddresses.forEach((tokenAddress, index) => {
      const result = data[index];
      const addressLower = tokenAddress.toLowerCase();
      if (result.status === 'success' && result.result !== undefined) {
        const priceValue = Number(formatUnits(result.result as unknown as bigint, 18));

        // 주소로 저장 (소문자 및 원본)
        prices[addressLower] = priceValue;
        prices[tokenAddress] = priceValue;

        // symbol로도 저장 (하위 호환성)
        const tokenInfo = getCollateralTokenByAddress(tokenAddress);
        if (tokenInfo) {
          prices[tokenInfo.symbol] = priceValue;
        } else {
          // config에 없으면 TOKEN_ADDRESS_TO_SYMBOL에서 찾기
          const symbol = TOKEN_ADDRESS_TO_SYMBOL[addressLower];
          if (symbol) {
            prices[symbol] = priceValue;
          }
        }
      } else {
        prices[addressLower] = 0;
        prices[tokenAddress] = 0;
        // symbol도 0으로 설정
        const tokenInfo = getCollateralTokenByAddress(tokenAddress);
        if (tokenInfo) {
          prices[tokenInfo.symbol] = 0;
        } else {
          const symbol = TOKEN_ADDRESS_TO_SYMBOL[addressLower];
          if (symbol) {
            prices[symbol] = 0;
          }
        }
      }
    });
  }

  // 대여 토큰은 1:1 고정
  lendTokenAddresses.forEach((tokenAddress) => {
    const addressLower = tokenAddress.toLowerCase();
    prices[addressLower] = 1;
    prices[tokenAddress] = 1;

    // symbol로도 저장
    const tokenInfo = getLendTokenByAddress(tokenAddress);
    if (tokenInfo) {
      prices[tokenInfo.symbol] = 1;
    } else {
      const symbol = TOKEN_ADDRESS_TO_SYMBOL[addressLower];
      if (symbol) {
        prices[symbol] = 1;
      }
    }
  });

  return {
    prices,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}
