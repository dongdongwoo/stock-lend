import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther, formatEther } from 'viem';
import { getMasterWalletClient, getUserWalletClient, waitForTransaction, publicClient } from '../contracts/clients';
import { INITIAL_ETH_AMOUNT, MIN_ETH_BALANCE } from '../contracts/config';

const CUSTODY_WALLET_KEY_PREFIX = 'custody_wallet_';

export interface CustodyWallet {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

// 유저 ID 기반 키 생성
function getCustodyWalletKey(userId: string): string {
  return `${CUSTODY_WALLET_KEY_PREFIX}${userId}`;
}

// 커스터디 월렛 생성
export function createCustodyWallet(): CustodyWallet {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    address: account.address,
  };
}

// localStorage에서 유저별 월렛 로드
export function loadCustodyWallet(userId: string): CustodyWallet | null {
  if (typeof window === 'undefined') return null;
  
  const key = getCustodyWalletKey(userId);
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  
  try {
    const wallet = JSON.parse(stored) as CustodyWallet;
    // 유효성 검증
    const account = privateKeyToAccount(wallet.privateKey);
    if (account.address.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error('Wallet validation failed');
      return null;
    }
    return wallet;
  } catch (e) {
    console.error('Failed to load custody wallet:', e);
    return null;
  }
}

// localStorage에 유저별 월렛 저장
export function saveCustodyWallet(userId: string, wallet: CustodyWallet): void {
  if (typeof window === 'undefined') return;
  const key = getCustodyWalletKey(userId);
  localStorage.setItem(key, JSON.stringify(wallet));
}

// 유저별 월렛 삭제
export function clearCustodyWallet(userId: string): void {
  if (typeof window === 'undefined') return;
  const key = getCustodyWalletKey(userId);
  localStorage.removeItem(key);
}

// 모든 커스터디 월렛 삭제 (전체 로그아웃 시)
export function clearAllCustodyWallets(): void {
  if (typeof window === 'undefined') return;
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith(CUSTODY_WALLET_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}

// 마스터 지갑에서 유저 지갑으로 초기 ETH 전송
export async function fundCustodyWallet(userAddress: `0x${string}`): Promise<`0x${string}`> {
  const masterClient = getMasterWalletClient();
  
  const hash = await masterClient.sendTransaction({
    to: userAddress,
    value: parseEther(INITIAL_ETH_AMOUNT),
  });
  
  // 트랜잭션 완료 대기
  await waitForTransaction(hash);
  
  return hash;
}

// ETH 잔액 확인 (RPC rate limit 에러 처리 포함)
export async function getEthBalance(address: `0x${string}`): Promise<bigint> {
  let retries = 0;
  const maxRetries = 5;
  const baseDelay = 1000; // 1 second

  while (retries < maxRetries) {
    try {
      return await publicClient.getBalance({ address });
    } catch (error: any) {
      if (
        (error.message?.includes('over rate limit') ||
          error.message?.includes('rate limit') ||
          error.code === -32016) &&
        retries < maxRetries - 1
      ) {
        const delay = baseDelay * Math.pow(2, retries);
        console.warn(
          `Rate limit hit while getting ETH balance. Retrying in ${delay / 1000} seconds... (Attempt ${retries + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error; // Re-throw other errors or the last rate limit error
      }
    }
  }
  throw new Error('Failed to get ETH balance after multiple retries due to rate limit.');
}

// ETH 잔액이 부족하면 마스터가 자동으로 전송
export async function ensureEthBalance(userAddress: `0x${string}`): Promise<`0x${string}` | null> {
  const balance = await getEthBalance(userAddress);
  const minBalance = parseEther(MIN_ETH_BALANCE);
  
  // 잔액이 충분하면 전송하지 않음
  if (balance >= minBalance) {
    return null;
  }
  
  // 부족한 만큼 전송 (최소 잔액까지)
  const masterClient = getMasterWalletClient();
  const amountToSend = parseEther(MIN_ETH_BALANCE);
  
  const hash = await masterClient.sendTransaction({
    to: userAddress,
    value: amountToSend,
  });
  
  // 트랜잭션 완료 대기
  await waitForTransaction(hash);
  
  return hash;
}

// 유저 월렛 클라이언트 가져오기
export function getCustodyWalletClient(userId: string) {
  const wallet = loadCustodyWallet(userId);
  if (!wallet) {
    throw new Error(`No custody wallet found for user: ${userId}`);
  }
  return getUserWalletClient(wallet.privateKey);
}

// 월렛 주소만 가져오기
export function getCustodyWalletAddress(userId: string): `0x${string}` | null {
  const wallet = loadCustodyWallet(userId);
  return wallet?.address ?? null;
}

