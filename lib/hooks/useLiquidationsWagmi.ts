'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { lendingAbi } from '../contracts/abis/lending';
import { CONTRACTS, getCollateralTokenByAddress, getLendTokenByAddress } from '../contracts/config';
import { getCustodyWalletAddress } from '../wallet/custody';
import { useStore } from '../store';
import type { LiquidationInfo } from '../contracts/lending';

// ============ Types ============

export interface UILiquidationInfo {
  borrowOfferId: bigint;
  liquidatedAt: number;
  collateralReturned: number;
  liquidator: string;
  collateralToken: string;
  collateralStock: string;
  lendToken: string;
  loanCurrency: string;
  debtRepaid: number;
  collateralSeized: number;
  // BorrowOffer 정보
  borrower: string;
  lender: string;
  collateralAmount: number;
  loanAmount: number;
  interestRate: number;
}

// ============ Helpers ============

function formatTokenAmount(amount: bigint, decimals: number = 18): number {
  return Number(formatUnits(amount, decimals));
}

// ============ Hooks ============

// 사용자의 청산 히스토리 조회
export function useUserLiquidations() {
  const { user } = useStore();
  const walletAddress = user ? getCustodyWalletAddress(user.id) : undefined;

  // 1. 사용자의 청산된 borrowOfferId 목록 조회
  const {
    data: liquidationIds,
    isLoading: isLoadingIds,
    isError: isErrorIds,
    error: errorIds,
  } = useReadContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'getUserLiquidations',
    args: walletAddress ? [walletAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!walletAddress,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // 2. 각 borrowOfferId에 대해 청산 정보와 BorrowOffer 정보 조회
  const liquidationIdsArray = liquidationIds as bigint[] | undefined;
  const contracts = liquidationIdsArray
    ? liquidationIdsArray.flatMap((id) => [
        {
          address: CONTRACTS.lending,
          abi: lendingAbi,
          functionName: 'getLiquidationInfo' as const,
          args: [id],
        },
        {
          address: CONTRACTS.lending,
          abi: lendingAbi,
          functionName: 'borrowOffers' as const,
          args: [id],
        },
      ])
    : [];

  const {
    data: liquidationData,
    isLoading: isLoadingData,
    isError: isErrorData,
    error: errorData,
  } = useReadContracts({
    contracts,
    query: {
      enabled: !!walletAddress && !!liquidationIdsArray && liquidationIdsArray.length > 0,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // 데이터 변환
  const liquidations: UILiquidationInfo[] = [];
  if (liquidationData && liquidationIdsArray) {
    for (let i = 0; i < liquidationIdsArray.length; i++) {
      const infoIndex = i * 2;
      const offerIndex = i * 2 + 1;

      const liquidationInfo = liquidationData[infoIndex]?.result as LiquidationInfo | undefined;
      const borrowOffer = liquidationData[offerIndex]?.result as any;

      if (liquidationInfo && borrowOffer) {
        const collateralToken = getCollateralTokenByAddress(liquidationInfo.collateralToken);
        const lendToken = getLendTokenByAddress(liquidationInfo.lendToken);

        liquidations.push({
          borrowOfferId: liquidationIdsArray[i],
          liquidatedAt: Number(liquidationInfo.liquidatedAt) * 1000, // timestamp to ms
          collateralReturned: formatTokenAmount(liquidationInfo.collateralReturned),
          liquidator: liquidationInfo.liquidator,
          collateralToken: liquidationInfo.collateralToken,
          collateralStock: collateralToken?.symbol || 'UNKNOWN',
          lendToken: liquidationInfo.lendToken,
          loanCurrency: lendToken?.symbol || 'UNKNOWN',
          debtRepaid: formatTokenAmount(liquidationInfo.debtRepaid),
          collateralSeized: formatTokenAmount(liquidationInfo.collateralSeized),
          borrower: borrowOffer.borrower,
          lender: borrowOffer.lender,
          collateralAmount: formatTokenAmount(borrowOffer.collateralAmount),
          loanAmount: formatTokenAmount(borrowOffer.loanAmount),
          interestRate: Number(borrowOffer.interestRateBps) / 100,
        });
      }
    }
  }

  // 시간순 정렬 (최신순)
  liquidations.sort((a, b) => b.liquidatedAt - a.liquidatedAt);

  return {
    liquidations,
    loading: isLoadingIds || isLoadingData,
    error: isErrorIds || isErrorData ? (errorIds || errorData) : null,
  };
}

