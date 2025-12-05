import { publicClient, waitForTransaction } from './clients';
import { getCustodyWalletClient } from '../wallet/custody';
import { CONTRACTS } from './config';

// 모든 write 함수에 userId 파라미터 추가 필요
import { lendingAbi } from './abis/lending';
import { lendingViewerAbi } from './abis/lendingViewer';
import { lendingConfigAbi } from './abis/lendingConfig';

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
  categoryId: bigint; // 종목군 ID (collateralToken에서 변경됨)
  lendToken: `0x${string}`;
  collateralAmount: bigint;
  loanAmount: bigint;
  interestRateBps: bigint;
  duration: bigint;
  createdAt: bigint;
  matchedAt: bigint;
  expiresAt: bigint;
  borrowOfferId: bigint; // 매칭된 BorrowOffer ID (takeLendOffer로 생성된 경우)
  state: number;
  earlyRepayFeeBps: bigint;
}

export interface RiskParams {
  maxLtvBps: bigint;
  liquidationBps: bigint;
  liquidationPenaltyBps: bigint;
}

export interface LiquidationInfo {
  liquidatedAt: bigint;
  collateralReturned: bigint;
  liquidator: `0x${string}`;
  collateralToken: `0x${string}`;
  lendToken: `0x${string}`;
  debtRepaid: bigint;
  collateralSeized: bigint;
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

// 담보 토큰 허용 여부 확인 (config 컨트랙트 사용)
export async function isCollateralTokenAllowed(token: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'allowedCollateralTokens',
    args: [token],
  });
}

// 대여 토큰 허용 여부 확인 (config 컨트랙트 사용)
export async function isLendTokenAllowed(token: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'allowedLendTokens',
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

// ============ Config Contract Functions ============

// 모든 카테고리 ID 목록 조회
export async function getAllCategories(): Promise<bigint[]> {
  return publicClient.readContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'getAllCategories',
  }) as Promise<bigint[]>;
}

// 특정 카테고리의 토큰 목록 조회
export async function getCategoryTokens(categoryId: bigint): Promise<`0x${string}`[]> {
  return publicClient.readContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'getCategoryTokens',
    args: [categoryId],
  }) as Promise<`0x${string}`[]>;
}

// 토큰의 카테고리 ID 조회
export async function getTokenCategory(token: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'tokenCategory',
    args: [token],
  }) as Promise<bigint>;
}

// 카테고리별 리스크 파라미터 조회
export async function getCategoryRiskParams(categoryId: bigint): Promise<RiskParams> {
  const [maxLtvBps, liquidationBps, liquidationPenaltyBps] = await publicClient.readContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'categoryRiskParams',
    args: [categoryId],
  });
  return { maxLtvBps, liquidationBps, liquidationPenaltyBps };
}

// 청산 정보 조회
export async function getLiquidationInfo(borrowOfferId: bigint): Promise<LiquidationInfo> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'getLiquidationInfo',
    args: [borrowOfferId],
  });
  return result as unknown as LiquidationInfo;
}

// 사용자의 청산된 borrowOfferId 목록 조회
export async function getUserLiquidations(user: `0x${string}`): Promise<bigint[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'getUserLiquidations',
    args: [user],
  });
  return result as unknown as bigint[];
}

// ============ Viewer Functions ============

// 모든 Borrow Offers 조회
export async function getAllBorrowOffers(): Promise<BorrowOffer[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getBorrowOffers',
  });
  // 반환값이 { data: BorrowOffer[] } 형태
  return (result as { data: BorrowOffer[] }).data || (result as unknown as BorrowOffer[]);
}

// 모든 Lend Offers 조회
export async function getAllLendOffers(): Promise<LendOffer[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getLendOffers',
  });
  // 반환값이 { data: LendOffer[] } 형태
  return (result as { data: LendOffer[] }).data || (result as unknown as LendOffer[]);
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
  // 반환값이 { data: BorrowOffer[] } 형태
  return (result as { data: BorrowOffer[] }).data || (result as unknown as BorrowOffer[]);
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
  // 반환값이 { data: LendOffer[] } 형태
  return (result as { data: LendOffer[] }).data || (result as unknown as LendOffer[]);
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
  // 반환값이 { data: BorrowOffer[] } 형태
  return (result as { data: BorrowOffer[] }).data || (result as unknown as BorrowOffer[]);
}

// 유저가 borrower로서 매칭한 Lend Offers 조회
export async function getBorrowerLendOffers(
  user: `0x${string}`,
  stateFilter: OfferState = OfferState.None,
): Promise<LendOffer[]> {
  const result = await publicClient.readContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getBorrowerLendOffers',
    args: [user, stateFilter],
  });
  // 반환값이 { data: LendOffer[] } 형태
  return (result as { data: LendOffer[] }).data || (result as unknown as LendOffer[]);
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

  let retries = 0;
  const maxRetries = 5;
  const baseDelay = 1000; // 1 second

  while (retries < maxRetries) {
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACTS.lending,
        abi: lendingAbi,
        functionName: 'cancelBorrowOffer',
        args: [offerId],
      });

      await waitForTransaction(hash);
      return hash;
    } catch (error: any) {
      if (
        (error.message?.includes('over rate limit') ||
          error.message?.includes('rate limit') ||
          error.code === -32016) &&
        retries < maxRetries - 1
      ) {
        const delay = baseDelay * Math.pow(2, retries);
        console.warn(
          `Rate limit hit while canceling borrow offer. Retrying in ${delay / 1000} seconds... (Attempt ${retries + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error; // Re-throw other errors or the last rate limit error
      }
    }
  }
  throw new Error('Failed to cancel borrow offer after multiple retries due to rate limit.');
}

// Lend Offer 생성
export async function createLendOffer(
  params: {
    categoryId: bigint; // 종목군 ID (collateralToken에서 변경됨)
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
      params.categoryId,
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
    newCategoryId: bigint;
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
      params.newCategoryId,
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

  let retries = 0;
  const maxRetries = 5;
  const baseDelay = 1000; // 1 second

  while (retries < maxRetries) {
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACTS.lending,
        abi: lendingAbi,
        functionName: 'cancelLendOffer',
        args: [offerId],
      });

      await waitForTransaction(hash);
      return hash;
    } catch (error: any) {
      if (
        (error.message?.includes('over rate limit') ||
          error.message?.includes('rate limit') ||
          error.code === -32016) &&
        retries < maxRetries - 1
      ) {
        const delay = baseDelay * Math.pow(2, retries);
        console.warn(
          `Rate limit hit while canceling lend offer. Retrying in ${delay / 1000} seconds... (Attempt ${retries + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error; // Re-throw other errors or the last rate limit error
      }
    }
  }
  throw new Error('Failed to cancel lend offer after multiple retries due to rate limit.');
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
  collateralToken: `0x${string}`, // borrower의 담보 토큰 주소
  collateralAmount: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lending,
    abi: lendingAbi,
    functionName: 'takeLendOffer',
    args: [lendOfferId, collateralToken, collateralAmount],
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

// ============ Admin Functions (Config Contract) ============

export async function setCollateralToken(
  token: `0x${string}`,
  allowed: boolean,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
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
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'setLendToken',
    args: [token, allowed],
  });

  await waitForTransaction(hash);
  return hash;
}

// 카테고리별 리스크 파라미터 설정 (config 컨트랙트 사용)
export async function setCategoryRiskParams(
  categoryId: bigint,
  maxLtvBps: bigint,
  liquidationBps: bigint,
  liquidationPenaltyBps: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'setCategoryRiskParams',
    args: [categoryId, maxLtvBps, liquidationBps, liquidationPenaltyBps],
  });

  await waitForTransaction(hash);
  return hash;
}

// 토큰 카테고리 설정 (config 컨트랙트 사용)
export async function setTokenCategory(
  token: `0x${string}`,
  categoryId: bigint,
  userId: string,
): Promise<`0x${string}`> {
  const walletClient = getCustodyWalletClient(userId);

  const hash = await walletClient.writeContract({
    address: CONTRACTS.lendingConfig,
    abi: lendingConfigAbi,
    functionName: 'setTokenCategory',
    args: [token, categoryId],
  });

  await waitForTransaction(hash);
  return hash;
}

// 레거시 호환을 위한 함수 (deprecated - setCategoryRiskParams와 setTokenCategory 조합 사용 권장)
export async function setCollateralRiskParams(
  token: `0x${string}`,
  maxLtvBps: bigint,
  liquidationBps: bigint,
  liquidationPenaltyBps: bigint,
  userId: string,
): Promise<`0x${string}`> {
  // 먼저 토큰의 카테고리 ID를 조회해야 하지만, 
  // 이 함수는 deprecated이므로 직접 호출하지 않도록 권장
  throw new Error(
    'setCollateralRiskParams is deprecated. Use setTokenCategory and setCategoryRiskParams instead.',
  );
}

