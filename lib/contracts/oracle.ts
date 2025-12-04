import { publicClient, waitForTransaction, getMasterWalletClient } from './clients';
import { CONTRACTS } from './config';
import { oracleAbi } from './abis/oracle';

// 특정 자산의 가격 조회
export async function getPrice(assetAddress: `0x${string}`): Promise<bigint> {
  const price = await publicClient.readContract({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'getPrice',
    args: [assetAddress],
  });
  return price;
}

// 담보토큰(한화) 가격 조회
export async function getCollateralTokenPrice(): Promise<bigint> {
  return getPrice(CONTRACTS.collateralToken);
}

// 대여토큰(원화) 가격 조회
export async function getLendTokenPrice(): Promise<bigint> {
  return getPrice(CONTRACTS.lendToken);
}

// 가격 설정 (Owner만 가능 - Master Wallet 사용)
export async function setPrice(
  assetAddress: `0x${string}`,
  price: bigint
): Promise<`0x${string}`> {
  // Oracle 가격 설정은 Owner(마스터 지갑)만 가능
  const walletClient = getMasterWalletClient();
  
  const hash = await walletClient.writeContract({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'setPrice',
    args: [assetAddress, price],
  });
  
  await waitForTransaction(hash);
  return hash;
}

// 담보토큰 가격 설정
export async function setCollateralTokenPrice(price: bigint): Promise<`0x${string}`> {
  return setPrice(CONTRACTS.collateralToken, price);
}

// 대여토큰 가격 설정
export async function setLendTokenPrice(price: bigint): Promise<`0x${string}`> {
  return setPrice(CONTRACTS.lendToken, price);
}

// Oracle Owner 조회
export async function getOracleOwner(): Promise<`0x${string}`> {
  const owner = await publicClient.readContract({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'owner',
  });
  return owner;
}

