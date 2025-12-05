'use client';

import { useState, useEffect } from 'react';
import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { oracleAbi } from '../contracts/abis/oracle';
import {
  CONTRACTS,
  TOKEN_ADDRESS_TO_SYMBOL,
  getCollateralTokenByAddress,
  getLendTokenByAddress,
} from '../contracts/config';
import { useAllowedLendTokensWagmi } from './useAllowedTokensWagmi';
import { useCategoriesWagmi } from './useCategoriesWagmi';
import { lendingConfigAbi } from '../contracts/abis/lendingConfig';

export interface OraclePrices {
  [key: string]: number;
  lastUpdated: number;
}

export function useOraclePricesWagmi() {
  // 1. getAllCategories()로 카테고리 ID 목록 가져오기
  const { categories, isLoading: isLoadingCategories } = useCategoriesWagmi();

  // 2. 각 카테고리 ID에 대해 getCategoryTokens() 호출
  const categoryTokensContracts = categories.map((category) => ({
    address: CONTRACTS.lendingConfig as `0x${string}`,
    abi: lendingConfigAbi,
    functionName: 'getCategoryTokens' as const,
    args: [category.id] as const,
  }));

  const { data: categoryTokensData, isLoading: isLoadingCategoryTokens } = useReadContracts({
    contracts: categoryTokensContracts,
    query: {
      enabled: categories.length > 0,
      refetchInterval: 30000,
      staleTime: 10000,
    },
  });

  // 3. 모든 카테고리의 토큰 주소를 하나의 배열로 합치기 (중복 제거)
  const allTokenAddressesSet = new Set<`0x${string}`>();

  if (categoryTokensData) {
    categoryTokensData.forEach((result, index) => {
      if (result.status === 'success' && result.result) {
        // result.result는 address[] 배열
        const tokenAddresses = result.result as `0x${string}`[];
        if (Array.isArray(tokenAddresses)) {
          tokenAddresses.forEach((addr) => {
            allTokenAddressesSet.add(addr);
          });
        }
      } else if (result.status === 'failure') {
        console.warn(`Failed to get tokens for category ${categories[index]?.name}:`, result.error);
      }
    });
  }

  const collateralTokenAddresses = Array.from(allTokenAddressesSet);

  // 대여 토큰은 getAllowedLendTokens() 사용
  const { tokens: lendTokenAddresses } = useAllowedLendTokensWagmi();

  // 로딩 상태
  const isLoadingTokens = isLoadingCategories || isLoadingCategoryTokens;

  // 4. 모든 담보 토큰에 대한 Oracle 가격 조회 요청 생성
  const priceContracts = collateralTokenAddresses.map((tokenAddress) => ({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'getPrice',
    args: [tokenAddress],
  }));

  const {
    data,
    isLoading: isLoadingPrices,
    isError,
    error,
    refetch,
  } = useReadContracts({
    contracts: priceContracts,
    query: {
      enabled: collateralTokenAddresses.length > 0 && !isLoadingTokens,
      refetchInterval: 2000, // 2초마다 자동 갱신
      staleTime: 1000,
    },
  });

  // 전체 로딩 상태: 토큰 목록 로딩 중이거나 가격 로딩 중이면 로딩
  const isLoading = isLoadingTokens || isLoadingPrices;

  // 이전 가격을 유지하기 위한 state
  const [cachedPrices, setCachedPrices] = useState<OraclePrices>({ lastUpdated: 0 });

  // 결과를 OraclePrices 형태로 변환
  const prices: OraclePrices = { ...cachedPrices, lastUpdated: Date.now() };

  // 디버깅: 토큰 주소 목록 확인
  if (!isLoading) {
    console.log('useOraclePricesWagmi:', {
      categories: categories.map((c) => ({ id: c.id.toString(), name: c.name })),
      categoryTokensData: categoryTokensData?.map((result, index) => ({
        category: categories[index]?.name,
        status: result?.status,
        tokenCount:
          result?.status === 'success' && Array.isArray(result.result) ? result.result.length : 0,
        tokens:
          result?.status === 'success' && Array.isArray(result.result)
            ? (result.result as `0x${string}`[]).map((a) => a.toLowerCase())
            : [],
        error: result?.error,
      })),
      collateralTokenAddresses: collateralTokenAddresses.map((a) => a.toLowerCase()),
      priceContractsCount: priceContracts.length,
      dataLength: data?.length,
      data: data?.map((result, index) => ({
        index,
        status: result?.status,
        price:
          result?.status === 'success' && result.result
            ? Number(formatUnits(result.result as unknown as bigint, 18))
            : null,
        error: result?.error,
        tokenAddress: collateralTokenAddresses[index]?.toLowerCase(),
      })),
      error: error?.message,
      isError,
    });
  }

  // 가격 데이터가 성공적으로 로드되었을 때만 업데이트
  useEffect(() => {
    if (
      data &&
      !isLoadingPrices &&
      collateralTokenAddresses.length > 0 &&
      data.length === collateralTokenAddresses.length
    ) {
      setCachedPrices((prevPrices) => {
        const newPrices: OraclePrices = { ...prevPrices, lastUpdated: Date.now() };
        let hasUpdates = false;

        collateralTokenAddresses.forEach((tokenAddress, index) => {
          const result = data[index];
          if (!result) return; // result가 없으면 스킵

          const addressLower = tokenAddress.toLowerCase();

          if (result.status === 'success' && result.result !== undefined) {
            const priceValue = Number(formatUnits(result.result as unknown as bigint, 18));

            // 가격이 0보다 클 때만 업데이트 (0은 유효한 가격일 수도 있지만, 일반적으로는 오류)
            // 이전 가격이 있으면 유지하고, 없을 때만 0으로 설정
            if (priceValue > 0 || !prevPrices[addressLower]) {
              // 주소로 저장 (소문자 및 원본)
              newPrices[addressLower] = priceValue;
              newPrices[tokenAddress] = priceValue;

              // symbol로도 저장 (하위 호환성)
              const tokenInfo = getCollateralTokenByAddress(tokenAddress);
              if (tokenInfo) {
                newPrices[tokenInfo.symbol] = priceValue;
                console.log(`Price for ${tokenInfo.symbol} (${addressLower}):`, priceValue);
              } else {
                // config에 없으면 TOKEN_ADDRESS_TO_SYMBOL에서 찾기
                const symbol = TOKEN_ADDRESS_TO_SYMBOL[addressLower];
                if (symbol) {
                  newPrices[symbol] = priceValue;
                  console.log(`Price for ${symbol} (${addressLower}) from mapping:`, priceValue);
                } else {
                  console.warn(`Token info not found for address: ${addressLower}`);
                }
              }
              hasUpdates = true;
            } else {
              // 가격이 0이고 이전 가격이 있으면 이전 가격 유지
              if (prevPrices[addressLower]) {
                newPrices[addressLower] = prevPrices[addressLower];
                newPrices[tokenAddress] = prevPrices[tokenAddress];
                const tokenInfo = getCollateralTokenByAddress(tokenAddress);
                if (tokenInfo && prevPrices[tokenInfo.symbol]) {
                  newPrices[tokenInfo.symbol] = prevPrices[tokenInfo.symbol];
                } else {
                  const symbol = TOKEN_ADDRESS_TO_SYMBOL[addressLower];
                  if (symbol && prevPrices[symbol]) {
                    newPrices[symbol] = prevPrices[symbol];
                  }
                }
              }
            }
          } else {
            // 실패한 경우 이전 가격 유지
            if (prevPrices[addressLower]) {
              newPrices[addressLower] = prevPrices[addressLower];
              newPrices[tokenAddress] = prevPrices[tokenAddress];
              const tokenInfo = getCollateralTokenByAddress(tokenAddress);
              if (tokenInfo && prevPrices[tokenInfo.symbol]) {
                newPrices[tokenInfo.symbol] = prevPrices[tokenInfo.symbol];
              } else {
                const symbol = TOKEN_ADDRESS_TO_SYMBOL[addressLower];
                if (symbol && prevPrices[symbol]) {
                  newPrices[symbol] = prevPrices[symbol];
                }
              }
            } else {
              // 이전 가격도 없으면 0으로 설정
              console.warn(`Failed to get price for ${addressLower}:`, {
                status: result.status,
                error: result.error,
              });
              newPrices[addressLower] = 0;
              newPrices[tokenAddress] = 0;
              const tokenInfo = getCollateralTokenByAddress(tokenAddress);
              if (tokenInfo) {
                newPrices[tokenInfo.symbol] = 0;
              } else {
                const symbol = TOKEN_ADDRESS_TO_SYMBOL[addressLower];
                if (symbol) {
                  newPrices[symbol] = 0;
                }
              }
            }
          }
        });

        // 업데이트가 있거나 초기 로드인 경우에만 state 업데이트
        if (hasUpdates || prevPrices.lastUpdated === 0) {
          return newPrices;
        }
        return prevPrices;
      });
    }
  }, [data, isLoadingPrices, collateralTokenAddresses.join(',')]); // 배열을 문자열로 변환하여 dependency 안정화

  // 최종 prices는 cachedPrices를 기반으로 하되, 대여 토큰은 항상 1로 설정
  const finalPrices: OraclePrices = { ...cachedPrices, lastUpdated: Date.now() };
  lendTokenAddresses.forEach((tokenAddress) => {
    const addressLower = tokenAddress.toLowerCase();
    finalPrices[addressLower] = 1;
    finalPrices[tokenAddress] = 1;
    const tokenInfo = getLendTokenByAddress(tokenAddress);
    if (tokenInfo) {
      finalPrices[tokenInfo.symbol] = 1;
    } else {
      const symbol = TOKEN_ADDRESS_TO_SYMBOL[addressLower];
      if (symbol) {
        finalPrices[symbol] = 1;
      }
    }
  });

  return {
    prices: finalPrices,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}
