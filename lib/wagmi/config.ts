'use client';

import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';

// Giwa Testnet 체인 정의
export const giwaTestnet = defineChain({
  id: 91342,
  name: 'Giwa Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia-rpc.giwa.io'] },
  },
  blockExplorers: {
    default: { name: 'Giwa Explorer', url: 'https://sepolia-explorer.giwa.io' },
  },
});

export const wagmiConfig = createConfig({
  chains: [giwaTestnet],
  transports: {
    [giwaTestnet.id]: http(),
  },
  ssr: true,
});

