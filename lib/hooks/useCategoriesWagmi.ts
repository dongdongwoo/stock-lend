'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS } from '../contracts/config';
import { lendingConfigAbi } from '../contracts/abis/lendingConfig';
import { mapCollateralTokens, CATEGORY_NAMES, CATEGORY_IDS, COLLATERAL_TOKENS } from '../contracts/config';
import type { CollateralTokenInfo } from '../contracts/config';

/**
 * 온체인에서 모든 카테고리 목록을 조회하는 hook
 */
export function useCategoriesWagmi() {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'getAllCategories',
    query: {
      refetchInterval: 30000,
      staleTime: 10000,
    },
  });

  // wagmi는 tuple 배열을 반환할 때 { data: ... } 형태로 반환할 수 있음
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  
  // 반환값 처리: getAllCategories는 uint256[]를 직접 반환
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categoriesArray: bigint[] = Array.isArray(rawData)
    ? rawData
    : rawData?.data && Array.isArray(rawData.data)
    ? rawData.data
    : rawData?.[0] && Array.isArray(rawData[0])
    ? rawData[0]
    : [];

  // 온체인에서 가져온 카테고리가 없으면 로컬 config에서 fallback 사용
  // (컨트랙트에 카테고리가 아직 설정되지 않은 경우 대비)
  let finalCategoriesArray = categoriesArray;
  if (isError || (!isLoading && categoriesArray.length === 0)) {
    // 로컬 config에서 카테고리 ID 목록 가져오기
    finalCategoriesArray = Object.values(CATEGORY_IDS);
    console.log('useCategoriesWagmi: Using fallback categories from config', {
      fallbackCategories: finalCategoriesArray.map((id) => id.toString()),
      originalError: error?.message,
    });
  }

  // 카테고리 ID 배열을 카테고리 정보로 변환
  const categories = finalCategoriesArray
    .map((categoryId) => ({
      id: categoryId,
      name: CATEGORY_NAMES[categoryId.toString()] || `카테고리 ${categoryId.toString()}`,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id)); // ID 순서대로 정렬 (A군=1, B군=2, C군=3)

  // 디버깅: 데이터 확인 (항상 로그 출력)
  if (!isLoading) {
    console.log('useCategoriesWagmi:', {
      rawData,
      categoriesArray: categoriesArray.map((id) => id.toString()),
      finalCategoriesArray: finalCategoriesArray.map((id) => id.toString()),
      categories,
      error: error?.message,
      isError,
      configAddress: CONTRACTS.lendingConfig,
      usingFallback: isError || categoriesArray.length === 0,
    });
  }

  return {
    categories,
    isLoading,
    isError,
    error,
    refetch,
  };
}

/**
 * 특정 카테고리의 토큰 목록을 조회하는 hook
 */
export function useCategoryTokensWagmi(categoryId: bigint | null) {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'getCategoryTokens',
    args: categoryId !== null ? [categoryId] : undefined,
    query: {
      enabled: categoryId !== null,
      refetchInterval: 30000,
      staleTime: 10000,
    },
  });

  // wagmi는 tuple 배열을 반환할 때 { data: ... } 형태로 반환할 수 있음
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  
  // 반환값이 { data: ... } 형태인 경우 처리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokenAddresses: `0x${string}`[] = [];
  if (rawData) {
    if (Array.isArray(rawData)) {
      tokenAddresses = rawData as `0x${string}`[];
    } else if (rawData.data && Array.isArray(rawData.data)) {
      tokenAddresses = rawData.data as `0x${string}`[];
    } else if (rawData[0] && Array.isArray(rawData[0])) {
      tokenAddresses = rawData[0] as `0x${string}`[];
    }
  }

  // 온체인에서 가져온 토큰이 없으면 로컬 config에서 fallback 사용
  let finalTokens: CollateralTokenInfo[] = mapCollateralTokens(tokenAddresses);
  if (isError || (!isLoading && tokenAddresses.length === 0 && categoryId !== null)) {
    // 로컬 config에서 해당 카테고리의 토큰들 필터링
    finalTokens = COLLATERAL_TOKENS.filter(
      (token) => token.categoryId && token.categoryId === categoryId
    );
    console.log('useCategoryTokensWagmi: Using fallback tokens from config', {
      categoryId: categoryId.toString(),
      fallbackTokens: finalTokens.map((t) => t.symbol),
      originalError: error?.message,
    });
  }

  return {
    tokens: finalTokens,
    isLoading,
    isError,
    error,
    refetch,
  };
}

/**
 * 모든 카테고리와 각 카테고리의 토큰 목록을 조회하는 hook
 */
export function useAllCategoriesWithTokensWagmi() {
  const { categories } = useCategoriesWagmi();

  // 모든 카테고리에 대한 토큰 조회 요청 생성
  const contracts = categories.map((category) => ({
    address: CONTRACTS.lendingConfig as `0x${string}`,
    abi: lendingConfigAbi,
    functionName: 'getCategoryTokens' as const,
    args: [category.id] as const,
  }));

  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: categories.length > 0,
      refetchInterval: 30000,
      staleTime: 10000,
    },
  });

  // 결과를 카테고리별로 매핑
  const categoriesWithTokens = categories.map((category, index) => {
    const result = data?.[index];
    let tokenAddresses: `0x${string}`[] = [];
    
    if (result) {
      if (result.status === 'success' && result.result) {
        // result.result가 배열인지 확인
        if (Array.isArray(result.result)) {
          tokenAddresses = result.result as `0x${string}`[];
        } else {
          // 배열이 아닌 경우 다른 형태로 감싸져 있을 수 있음
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawResult = result.result as any;
          if (rawResult.data && Array.isArray(rawResult.data)) {
            tokenAddresses = rawResult.data as `0x${string}`[];
          } else if (rawResult[0] && Array.isArray(rawResult[0])) {
            tokenAddresses = rawResult[0] as `0x${string}`[];
          }
        }
      } else if (result.status === 'failure') {
        console.warn(`useAllCategoriesWithTokensWagmi: Failed to get tokens for category ${category.name} (${category.id}):`, result.error);
      }
    }
    
    return {
      ...category,
      tokens: mapCollateralTokens(tokenAddresses),
    };
  });

  // 디버깅: 전체 결과 확인
  if (!isLoading) {
    console.log('useAllCategoriesWithTokensWagmi:', {
      categories: categories.map((c) => ({ id: c.id.toString(), name: c.name })),
      dataLength: data?.length,
      data: data?.map((result, index) => ({
        index,
        status: result?.status,
        result: result?.result,
        error: result?.error,
        category: categories[index]?.name,
      })),
      categoriesWithTokens: categoriesWithTokens.map((c) => ({
        category: c.name,
        tokenCount: c.tokens.length,
        tokens: c.tokens.map((t) => ({ symbol: t.symbol, address: t.address.toLowerCase() })),
      })),
      error: error?.message,
      isError,
    });
  }

  return {
    categoriesWithTokens,
    isLoading,
    isError,
    error,
    refetch,
  };
}

