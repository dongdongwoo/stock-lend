import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { GIWA_TESTNET, MASTER_PRIVATE_KEY } from './config';

// Giwa Testnet 체인 정의
export const giwaTestnet = defineChain({
  id: GIWA_TESTNET.id,
  name: GIWA_TESTNET.name,
  nativeCurrency: GIWA_TESTNET.nativeCurrency,
  rpcUrls: GIWA_TESTNET.rpcUrls,
  blockExplorers: GIWA_TESTNET.blockExplorers,
});

// Public Client (읽기 전용)
export const publicClient = createPublicClient({
  chain: giwaTestnet,
  transport: http(),
});

// 마스터 지갑 클라이언트 (ETH 전송용)
export function getMasterWalletClient() {
  if (!MASTER_PRIVATE_KEY) {
    throw new Error('NEXT_PUBLIC_MASTER_PRIVATE_KEY is not set');
  }
  const account = privateKeyToAccount(MASTER_PRIVATE_KEY);
  return createWalletClient({
    account,
    chain: giwaTestnet,
    transport: http(),
  });
}

// 유저 커스터디 지갑 클라이언트
export function getUserWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: giwaTestnet,
    transport: http(),
  });
}

// 트랜잭션 완료 대기
export async function waitForTransaction(hash: `0x${string}`) {
  return publicClient.waitForTransactionReceipt({ hash });
}

