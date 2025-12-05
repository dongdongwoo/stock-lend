'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { lendingViewerAbi } from '../contracts/abis/lendingViewer';
import { CONTRACTS, getCollateralTokenByAddress, getLendTokenByAddress } from '../contracts/config';
import type { UIBorrowOffer, UILendOffer } from './types';

// Re-export types for convenience
export type { UIBorrowOffer, UILendOffer } from './types';

// ============ Helpers ============

enum OfferState {
  None = 0,
  Active = 1,
  Matched = 2,
  Closed = 3,
  Cancelled = 4,
  Liquidated = 5,
}

function offerStateToString(
  state: number,
): 'active' | 'matched' | 'closed' | 'cancelled' | 'liquidated' {
  switch (state) {
    case OfferState.Active:
      return 'active';
    case OfferState.Matched:
      return 'matched';
    case OfferState.Closed:
      return 'closed';
    case OfferState.Cancelled:
      return 'cancelled';
    case OfferState.Liquidated:
      return 'liquidated';
    default:
      // 예상치 못한 상태는 cancelled로 처리하여 필터링에서 제외
      return 'cancelled';
  }
}

function bpsToPercent(bps: bigint): number {
  return Number(bps) / 100;
}

function durationToDays(duration: bigint): number {
  return Math.ceil(Number(duration) / 86400);
}

function formatTokenAmount(amount: bigint | undefined | null, decimals: number = 18): number {
  if (amount === undefined || amount === null) {
    return 0;
  }
  return Number(formatUnits(amount, decimals));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformBorrowOffer(offer: any): UIBorrowOffer {
  const collateralToken = getCollateralTokenByAddress(offer.collateralToken);
  const lendToken = getLendTokenByAddress(offer.lendToken);

  const collateralAmount = formatTokenAmount(offer.collateralAmount);
  const loanAmount = formatTokenAmount(offer.loanAmount);
  const ltv = collateralAmount > 0 ? (loanAmount / collateralAmount) * 100 : 0;

  // state 필드 접근: 실제 컨트랙트 순서에서 state는 17번째 (인덱스 16)
  // 실제 컨트랙트 순서: id(0), borrower(1), lender(2), collateralToken(3), lendToken(4),
  // collateralAmount(5), loanAmount(6), principalDebt(7), interestRateBps(8),
  // duration(9), createdAt(10), matchedAt(11), expiresAt(12), lastInterestTimestamp(13),
  // earlyRepayFeeBps(14), interestPaid(15), state(16)
  let stateValue = offer.state;

  // state가 없거나 0인 경우 디버깅
  if (stateValue === undefined || stateValue === null || Number(stateValue) === 0) {
    console.warn('BorrowOffer state issue:', {
      id: offer.id?.toString(),
      state: offer.state,
      stateValue,
      offerKeys: Object.keys(offer),
      isArray: Array.isArray(offer),
      offerLength: Array.isArray(offer) ? offer.length : undefined,
      stateAtIndex16: Array.isArray(offer) ? offer[16] : undefined,
      fullOffer: offer,
    });

    // 배열 형태인 경우 인덱스로 접근 시도
    if (Array.isArray(offer) && offer[16] !== undefined) {
      stateValue = offer[16];
    }

    // state가 여전히 0이면 Active로 간주
    if (stateValue === undefined || stateValue === null || Number(stateValue) === 0) {
      stateValue = 1; // OfferState.Active = 1
    }
  }

  const stateNum = Number(stateValue);

  // earlyRepayFeeBps 파싱 (인덱스 14 또는 필드명으로 접근)
  let earlyRepayFeeBpsValue = offer.earlyRepayFeeBps;
  if (earlyRepayFeeBpsValue === undefined && Array.isArray(offer) && offer[14] !== undefined) {
    earlyRepayFeeBpsValue = offer[14];
  }
  const earlyRepayFeeBps = earlyRepayFeeBpsValue !== undefined ? Number(earlyRepayFeeBpsValue) : 0;

  return {
    id: offer.id.toString(),
    onChainId: offer.id,
    borrower: offer.borrower,
    borrowerWallet: offer.borrower,
    lender: offer.lender === '0x0000000000000000000000000000000000000000' ? null : offer.lender,
    collateralStock: collateralToken?.symbol || 'UNKNOWN',
    collateralTokenAddress: offer.collateralToken,
    collateralAmount,
    loanCurrency: lendToken?.symbol || 'dKRW',
    lendTokenAddress: offer.lendToken,
    loanAmount,
    interestRate: bpsToPercent(offer.interestRateBps),
    maturityDays: durationToDays(offer.duration),
    ltv,
    status: offerStateToString(stateNum),
    createdAt: Number(offer.createdAt) * 1000,
    matchedAt: offer.matchedAt > BigInt(0) ? Number(offer.matchedAt) * 1000 : undefined,
    expiresAt: offer.expiresAt > BigInt(0) ? Number(offer.expiresAt) * 1000 : undefined,
    principalDebt: formatTokenAmount(offer.principalDebt),
    accruedInterest: 0,
    healthFactor: 0,
    earlyRepayFeeBps,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformLendOffer(offer: any): UILendOffer {
  // categoryId로 변경됨 (collateralToken → categoryId)
  const categoryId = offer.categoryId || offer[3]; // 인덱스 3이 categoryId
  const lendToken = getLendTokenByAddress(offer.lendToken || offer[4]);

  // 매칭된 경우 borrower의 담보 토큰 주소를 가져옴 (borrowOfferId가 있으면)
  // 매칭 전에는 categoryId만 있고, 매칭 후에는 borrowOfferId가 있음
  let collateralTokenAddress: string | null = null;
  let requestedCollateralStock = `종목군 ${categoryId?.toString() || 'N/A'}`;
  
  // 매칭 전: categoryId만 표시 (실제 토큰 목록은 UI에서 동적으로 가져옴)
  // 매칭 후: borrowOfferId가 있으면 borrowOffer에서 collateralToken을 가져와야 하지만,
  // 여기서는 동기 함수이므로 일단 null로 설정하고, 필요시 UI에서 조회
  if (offer.borrowOfferId && offer.borrowOfferId > BigInt(0)) {
    // 매칭된 경우: borrowOffer를 조회해야 하지만 동기 함수이므로 null로 설정
    // UI에서 borrowOffer를 조회하여 표시
    collateralTokenAddress = null;
  }

  // state 필드 접근: 필드 이름 또는 인덱스로 접근 시도
  // 실제 컨트랙트 순서: id(0), lender(1), borrower(2), categoryId(3), lendToken(4),
  // collateralAmount(5), loanAmount(6), interestRateBps(7), earlyRepayFeeBps(8),
  // duration(9), createdAt(10), matchedAt(11), expiresAt(12), borrowOfferId(13), state(14)
  let stateValue = offer.state;

  // state가 없거나 0인 경우 디버깅
  if (stateValue === undefined || stateValue === null || Number(stateValue) === 0) {
    console.warn('LendOffer state issue:', {
      id: offer.id?.toString(),
      state: offer.state,
      stateValue,
      offerKeys: Object.keys(offer),
      isArray: Array.isArray(offer),
      offerLength: Array.isArray(offer) ? offer.length : undefined,
      // 배열인 경우 인덱스로 접근 시도 (state는 14번째, 인덱스 14)
      stateAtIndex14: Array.isArray(offer) ? offer[14] : undefined,
      fullOffer: offer,
    });

    // 배열 형태인 경우 인덱스로 접근 시도 (state는 14번째, 인덱스 14)
    if (Array.isArray(offer) && offer[14] !== undefined) {
      stateValue = offer[14];
    }

    // state가 여전히 0이면 Active로 간주 (컨트랙트에서 Active로 설정했으므로)
    if (stateValue === undefined || stateValue === null || Number(stateValue) === 0) {
      stateValue = 1; // OfferState.Active = 1
    }
  }

  const stateNum = Number(stateValue);

  // earlyRepayFeeBps 파싱 (인덱스 8 또는 필드명으로 접근)
  let earlyRepayFeeBpsValue = offer.earlyRepayFeeBps;
  if (earlyRepayFeeBpsValue === undefined && Array.isArray(offer) && offer[8] !== undefined) {
    earlyRepayFeeBpsValue = offer[8];
  }
  const earlyRepayFeeBps = earlyRepayFeeBpsValue !== undefined ? Number(earlyRepayFeeBpsValue) : 0;

  return {
    id: offer.id.toString(),
    onChainId: offer.id,
    lender: offer.lender,
    lenderWallet: offer.lender,
    borrower:
      offer.borrower === '0x0000000000000000000000000000000000000000' ? null : offer.borrower,
    requestedCollateralStock,
    categoryId: categoryId ? BigInt(categoryId) : BigInt(0),
    collateralTokenAddress,
    collateralAmount: formatTokenAmount(offer.collateralAmount ?? offer[5]),
    loanCurrency: lendToken?.symbol || 'dKRW',
    lendTokenAddress: offer.lendToken || offer[4],
    loanAmount: formatTokenAmount(offer.loanAmount ?? offer[6]),
    interestRate: bpsToPercent(offer.interestRateBps || offer[7]),
    maturityDays: durationToDays(offer.duration || offer[9]),
    status: offerStateToString(stateNum),
    createdAt: Number(offer.createdAt || offer[10]) * 1000,
    matchedAt: (offer.matchedAt || offer[11]) > BigInt(0) ? Number(offer.matchedAt || offer[11]) * 1000 : undefined,
    expiresAt: (offer.expiresAt || offer[12]) > BigInt(0) ? Number(offer.expiresAt || offer[12]) * 1000 : undefined,
    borrowOfferId: offer.borrowOfferId !== undefined && offer.borrowOfferId > BigInt(0) ? offer.borrowOfferId : undefined,
    earlyRepayFeeBps,
  };
}

// ============ Hooks ============

export function useBorrowOffersWagmi() {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getBorrowOffers',
    query: {
      refetchInterval: 2000, // 2초마다 자동 갱신
      staleTime: 1000,
    },
  });

  // wagmi는 tuple 배열을 반환할 때 { data: ... } 형태로 반환
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  // 반환값이 { data: ... } 형태인 경우 처리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offersArray: any[] = Array.isArray(rawData) 
    ? rawData 
    : rawData?.data 
    ? rawData.data 
    : rawData?.[0] || [];

  // 디버깅: 첫 번째 offer의 구조 확인
  if (offersArray.length > 0) {
    console.log('First borrow offer structure:', {
      keys: Object.keys(offersArray[0]),
      values: Object.values(offersArray[0]),
      full: offersArray[0],
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offers: UIBorrowOffer[] = offersArray.map(transformBorrowOffer);

  return {
    offers,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}

export function useLendOffersWagmi() {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACTS.lendingViewer,
    abi: lendingViewerAbi,
    functionName: 'getLendOffers',
    query: {
      refetchInterval: 2000, // 2초마다 자동 갱신
      staleTime: 1000,
    },
  });

  // wagmi는 tuple 배열을 반환할 때 { data: ... } 형태로 반환
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  // 반환값이 { data: ... } 형태인 경우 처리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offersArray: any[] = Array.isArray(rawData) 
    ? rawData 
    : rawData?.data 
    ? rawData.data 
    : rawData?.[0] || [];

  // 디버깅: 첫 번째 offer의 구조 확인
  if (offersArray.length > 0) {
    console.log('First lend offer structure:', {
      keys: Object.keys(offersArray[0]),
      values: Object.values(offersArray[0]),
      full: offersArray[0],
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offers: UILendOffer[] = offersArray.map(transformLendOffer);

  return {
    offers,
    loading: isLoading,
    error: isError ? error : null,
    refetch,
  };
}
