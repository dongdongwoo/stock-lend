'use client';

import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { mockERC20Abi } from '../contracts/abis/mockERC20';
import { getCustodyWalletAddress } from '../wallet/custody';
import { useStore } from '../store';
import { useAllowedCollateralTokensWagmi, useAllowedLendTokensWagmi } from './useAllowedTokensWagmi';

export interface TokenBalances {
  collateral: { [address: string]: number };
  lend: { [address: string]: number };
  eth: number;
}

export function useTokenBalancesWagmi() {
  const { user } = useStore();
  const walletAddress = user ? getCustodyWalletAddress(user.id) : null;
  const hasWallet = !!walletAddress;

  // 온체인에서 허용된 토큰 목록 조회
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();
  const { tokens: lendTokenAddresses } = useAllowedLendTokensWagmi();

  // 모든 토큰에 대한 잔액 조회 요청 생성
  const contracts = [
    ...collateralTokenAddresses.map((tokenAddress) => ({
      address: tokenAddress,
      abi: mockERC20Abi,
      functionName: 'balanceOf',
      args: [walletAddress!],
    })),
    ...lendTokenAddresses.map((tokenAddress) => ({
      address: tokenAddress,
      abi: mockERC20Abi,
      functionName: 'balanceOf',
      args: [walletAddress!],
    })),
  ];

  const { data, isLoading, isError, error } = useReadContracts({
    contracts: hasWallet && contracts.length > 0 ? contracts : [],
    query: {
      enabled: hasWallet && contracts.length > 0,
      refetchInterval: 1500,
      staleTime: 1000,
    },
  });

  // 결과 변환
  const balances: TokenBalances = {
    collateral: {},
    lend: {},
    eth: 0,
  };

  if (data) {
    // 담보 토큰 잔액
    collateralTokenAddresses.forEach((tokenAddress, index) => {
      const result = data[index];
      const addressLower = tokenAddress.toLowerCase();
      if (result.status === 'success' && result.result !== undefined) {
        const balance = Number(formatUnits(result.result as unknown as bigint, 18));
        balances.collateral[addressLower] = balance;
        balances.collateral[tokenAddress] = balance;
      } else {
        balances.collateral[addressLower] = 0;
        balances.collateral[tokenAddress] = 0;
      }
    });

    // 대여 토큰 잔액
    lendTokenAddresses.forEach((tokenAddress, index) => {
      const result = data[collateralTokenAddresses.length + index];
      const addressLower = tokenAddress.toLowerCase();
      if (result.status === 'success' && result.result !== undefined) {
        const balance = Number(formatUnits(result.result as unknown as bigint, 18));
        balances.lend[addressLower] = balance;
        balances.lend[tokenAddress] = balance;
      } else {
        balances.lend[addressLower] = 0;
        balances.lend[tokenAddress] = 0;
      }
    });
  }

  return {
    balances,
    loading: isLoading,
    error: isError ? error : null,
  };
}

