import { publicClient, waitForTransaction, getMasterWalletClient } from './clients';
import { getCustodyWalletClient, getCustodyWalletAddress } from '../wallet/custody';
import { CONTRACTS } from './config';
import { mockERC20Abi } from './abis/mockERC20';

type TokenType = 'collateral' | 'lend';

function getTokenAddress(tokenType: TokenType): `0x${string}` {
  return tokenType === 'collateral' ? CONTRACTS.collateralToken : CONTRACTS.lendToken;
}

// ============ 읽기 함수 ============

// 토큰 이름 조회
export async function getTokenName(tokenType: TokenType): Promise<string> {
  return publicClient.readContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'name',
  });
}

// 토큰 심볼 조회
export async function getTokenSymbol(tokenType: TokenType): Promise<string> {
  return publicClient.readContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'symbol',
  });
}

// 토큰 decimals 조회
export async function getTokenDecimals(tokenType: TokenType): Promise<number> {
  return publicClient.readContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'decimals',
  });
}

// 잔액 조회
export async function getTokenBalance(
  tokenType: TokenType,
  address: `0x${string}`,
): Promise<bigint> {
  return publicClient.readContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

// 현재 유저의 토큰 잔액 조회
export async function getMyTokenBalance(tokenType: TokenType, userId: string): Promise<bigint> {
  const address = getCustodyWalletAddress(userId);
  if (!address) throw new Error('No wallet connected');
  return getTokenBalance(tokenType, address);
}

// Allowance 조회
export async function getTokenAllowance(
  tokenType: TokenType,
  owner: `0x${string}`,
  spender: `0x${string}`,
): Promise<bigint> {
  return publicClient.readContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

// Minter 여부 확인
export async function isMinter(tokenType: TokenType, address: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'isMinter',
    args: [address],
  });
}

// ============ 쓰기 함수 ============

// Approve
export async function approveToken(
  tokenType: TokenType,
  spender: `0x${string}`,
  amount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'approve',
    args: [spender, amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// Transfer
export async function transferToken(
  tokenType: TokenType,
  to: `0x${string}`,
  amount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'transfer',
    args: [to, amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// Mint (Minter만 가능) - 유저 지갑으로 mint
export async function mintToken(
  tokenType: TokenType,
  to: `0x${string}`,
  amount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'mint',
    args: [to, amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// Master가 유저에게 토큰 Mint (대여 상품 등록 시 사용)
export async function mintTokenByMaster(
  tokenType: TokenType,
  to: `0x${string}`,
  amount: bigint,
): Promise<`0x${string}`> {
  const masterClient = getMasterWalletClient();

  const hash = await masterClient.writeContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'mint',
    args: [to, amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// Burn (Minter만 가능)
export async function burnToken(
  tokenType: TokenType,
  from: `0x${string}`,
  amount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'burn',
    args: [from, amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// Faucet (faucet이 활성화된 경우)
export async function faucetToken(
  tokenType: TokenType,
  amount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: getTokenAddress(tokenType),
    abi: mockERC20Abi,
    functionName: 'faucet',
    args: [amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// Lending 컨트랙트에 토큰 Approve
export async function approveTokenForLending(
  tokenType: TokenType,
  amount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  return approveToken(tokenType, CONTRACTS.lending, amount, userId);
}
