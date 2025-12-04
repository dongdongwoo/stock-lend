import { publicClient, waitForTransaction } from './clients';
import { getCustodyWalletClient } from '../wallet/custody';
import { CONTRACTS } from './config';

// 모든 write 함수에 userId 파라미터 추가 필요
import { lendingAbi } from './abis/lending';
import { lendingViewerAbi } from './abis/lendingViewer';

// ============ Types ============

// OfferState enum
export enum OfferState {
  None = 0,
  Active = 1,
  Matched = 2,
  Closed = 3,
  Cancelled = 4,
  Liquidated = 5,
}

export interface BorrowOffer {
  id: bigint;
  borrower: `0x${string}`;
  lender: `0x${string}`;
  collateralToken: `0x${string}`;
  lendToken: `0x${string}`;
  collateralAmount: bigint;
  loanAmount: bigint;
  interestRateBps: bigint;
  duration: bigint;
  createdAt: bigint;
  matchedAt: bigint;
  expiresAt: bigint;
  state: number;
  earlyRepayFeeBps: bigint;
  principalDebt: bigint;
  interestPaid: bigint;
  lastInterestTimestamp: bigint;
}

export interface LendOffer {
  id: bigint;
  lender: `0x${string}`;
  borrower: `0x${string}`;
  collateralToken: `0x${string}`;
  lendToken: `0x${string}`;
  collateralAmount: bigint;
  loanAmount: bigint;
  interestRateBps: bigint;
  duration: bigint;
  createdAt: bigint;
  matchedAt: bigint;
  expiresAt: bigint;
  state: number;
  earlyRepayFeeBps: bigint;
}

export interface RiskParams {
  maxLtvBps: bigint;
  liquidationBps: bigint;
  liquidationPenaltyBps: bigint;
}

// ============ Read Functions ============

// 특정 Borrow Offer 조회
export async function getBorrowOffer(offerId: bigint): Promise<BorrowOffer> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'borrowOffers',
    args: [offerId],
  });
  return result as unknown as BorrowOffer;
}

// 특정 Lend Offer 조회
export async function getLendOffer(offerId: bigint): Promise<LendOffer> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'lendOffers',
    args: [offerId],
  });
  return result as unknown as LendOffer;
}

// 누적 이자 조회
export async function getAccruedInterest(borrowOfferId: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'accruedInterest',
    args: [borrowOfferId],
  });
}

// 총 부채 조회 (원금 + 이자)
export async function getOutstandingDebt(borrowOfferId: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'outstandingDebt',
    args: [borrowOfferId],
  });
}

// Health Factor 조회
export async function getHealthFactor(borrowOfferId: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'currentHealthFactor',
    args: [borrowOfferId],
  });
}

// 담보 토큰 허용 여부 확인
export async function isCollateralTokenAllowed(token: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'isCollateralToken',
    args: [token],
  });
}

// 대여 토큰 허용 여부 확인
export async function isLendTokenAllowed(token: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'isLendToken',
    args: [token],
  });
}

// Risk Params 조회
export async function getCollateralRiskParams(token: `0x${string}`): Promise<RiskParams> {
  const [maxLtvBps, liquidationBps, liquidationPenaltyBps] = await publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'collateralRiskParams',
    args: [token],
  });
  return { maxLtvBps, liquidationBps, liquidationPenaltyBps };
}

// ============ Viewer Functions ============

// 모든 Borrow Offers 조회
export async function getAllBorrowOffers(): Promise<BorrowOffer[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getBorrowOffers',
  });
  return result as unknown as BorrowOffer[];
}

// 모든 Lend Offers 조회
export async function getAllLendOffers(): Promise<LendOffer[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getLendOffers',
  });
  return result as unknown as LendOffer[];
}

// 유저의 Borrow Positions 조회 (borrower로서)
export async function getUserBorrowPositions(
  user: `0x${string}`,
  stateFilter: OfferState = OfferState.None,
): Promise<BorrowOffer[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getBorrowPositions',
    args: [user, stateFilter],
  });
  return result as unknown as BorrowOffer[];
}

// 유저의 Lend Positions 조회 (lender로서 만든 lend offers)
export async function getUserLendPositions(
  user: `0x${string}`,
  stateFilter: OfferState = OfferState.None,
): Promise<LendOffer[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getLendPositions',
    args: [user, stateFilter],
  });
  return result as unknown as LendOffer[];
}

// 유저가 lender로서 참여한 Borrow Offers 조회
export async function getLenderLoanPositions(
  user: `0x${string}`,
  stateFilter: OfferState = OfferState.None,
): Promise<BorrowOffer[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getLenderLoanPositions',
    args: [user, stateFilter],
  });
  return result as unknown as BorrowOffer[];
}

// ============ Write Functions ============

// Borrow Offer 생성
export async function createBorrowOffer(
  params: {
    collateralToken: `0x${string}`;
    lendToken: `0x${string}`;
    collateralAmount: bigint;
    loanAmount: bigint;
    interestRateBps: bigint;
    duration: bigint;
    earlyRepayFeeBps: bigint;
  },
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'createBorrowOffer',
    args: [
      params.collateralToken,
      params.lendToken,
      params.collateralAmount,
      params.loanAmount,
      params.interestRateBps,
      params.duration,
      params.earlyRepayFeeBps,
    ],
  });

  await waitForTransaction(hash);
  return hash;
}

// Borrow Offer 수정
export async function updateBorrowOffer(
  params: {
    offerId: bigint;
    newCollateralAmount: bigint;
    newLoanAmount: bigint;
    newInterestRateBps: bigint;
    newDuration: bigint;
    newEarlyRepayFeeBps: bigint;
  },
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'updateBorrowOffer',
    args: [
      params.offerId,
      params.newCollateralAmount,
      params.newLoanAmount,
      params.newInterestRateBps,
      params.newDuration,
      params.newEarlyRepayFeeBps,
    ],
  });

  await waitForTransaction(hash);
  return hash;
}

// Borrow Offer 취소
export async function cancelBorrowOffer(offerId: bigint, userId: string): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'cancelBorrowOffer',
    args: [offerId],
  });

  await waitForTransaction(hash);
  return hash;
}

// Lend Offer 생성
export async function createLendOffer(
  params: {
    collateralToken: `0x${string}`;
    lendToken: `0x${string}`;
    loanAmount: bigint;
    interestRateBps: bigint;
    duration: bigint;
    earlyRepayFeeBps: bigint;
  },
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'createLendOffer',
    args: [
      params.collateralToken,
      params.lendToken,
      params.loanAmount,
      params.interestRateBps,
      params.duration,
      params.earlyRepayFeeBps,
    ],
  });

  await waitForTransaction(hash);
  return hash;
}

// Lend Offer 수정
export async function updateLendOffer(
  params: {
    offerId: bigint;
    newLoanAmount: bigint;
    newInterestRateBps: bigint;
    newDuration: bigint;
    newEarlyRepayFeeBps: bigint;
  },
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'updateLendOffer',
    args: [
      params.offerId,
      params.newLoanAmount,
      params.newInterestRateBps,
      params.newDuration,
      params.newEarlyRepayFeeBps,
    ],
  });

  await waitForTransaction(hash);
  return hash;
}

// Lend Offer 취소
export async function cancelLendOffer(offerId: bigint, userId: string): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'cancelLendOffer',
    args: [offerId],
  });

  await waitForTransaction(hash);
  return hash;
}

// Borrow Offer 매칭 (Lender가 호출)
export async function takeBorrowOffer(borrowOfferId: bigint, userId: string): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'takeBorrowOffer',
    args: [borrowOfferId],
  });

  await waitForTransaction(hash);
  return hash;
}

// Lend Offer 매칭 (Borrower가 호출)
export async function takeLendOffer(
  lendOfferId: bigint,
  collateralAmount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'takeLendOffer',
    args: [lendOfferId, collateralAmount],
  });

  await waitForTransaction(hash);
  return hash;
}

// 상환
export async function repay(borrowOfferId: bigint, amount: bigint, userId: string): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'repay',
    args: [borrowOfferId, amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// 전액 상환
export async function repayAll(borrowOfferId: bigint, userId: string): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'repayAll',
    args: [borrowOfferId],
  });

  await waitForTransaction(hash);
  return hash;
}

// 청산
export async function liquidate(borrowOfferId: bigint, userId: string): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'liquidate',
    args: [borrowOfferId],
  });

  await waitForTransaction(hash);
  return hash;
}

// 담보 추가
export async function addCollateral(borrowOfferId: bigint, amount: bigint, userId: string): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'addCollateral',
    args: [borrowOfferId, amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// 담보 출금
export async function withdrawCollateral(
  borrowOfferId: bigint,
  amount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'withdrawCollateral',
    args: [borrowOfferId, amount],
  });

  await waitForTransaction(hash);
  return hash;
}

// ============ Admin Functions ============

export async function setCollateralToken(
  token: `0x${string}`,
  allowed: boolean,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'setCollateralToken',
    args: [token, allowed],
  });

  await waitForTransaction(hash);
  return hash;
}

export async function setLendToken(
  token: `0x${string}`,
  allowed: boolean,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'setLendToken',
    args: [token, allowed],
  });

  await waitForTransaction(hash);
  return hash;
}

export async function setCollateralRiskParams(
  token: `0x${string}`,
  maxLtvBps: bigint,
  liquidationBps: bigint,
  liquidationPenaltyBps: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'setCollateralRiskParams',
    args: [token, maxLtvBps, liquidationBps, liquidationPenaltyBps],
  });

  await waitForTransaction(hash);
  return hash;
}

