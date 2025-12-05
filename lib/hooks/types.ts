// Shared types for offers
export interface UIBorrowOffer {
  id: string;
  onChainId: bigint;
  borrower: string;
  borrowerWallet: string;
  lender: string | null;
  collateralStock: string;
  collateralTokenAddress: string;
  collateralAmount: number;
  loanCurrency: string;
  lendTokenAddress: string;
  loanAmount: number;
  interestRate: number;
  maturityDays: number;
  ltv: number;
  status: 'active' | 'matched' | 'closed' | 'cancelled' | 'liquidated';
  createdAt: number;
  matchedAt?: number;
  expiresAt?: number;
  principalDebt: number;
  accruedInterest: number;
  healthFactor: number;
  earlyRepayFeeBps: number; // 중도상환수수료 (basis points, 100 = 1%)
}

export interface UILendOffer {
  id: string;
  onChainId: bigint;
  lender: string;
  lenderWallet: string;
  borrower: string | null;
  requestedCollateralStock: string; // 매칭 시 borrower가 선택한 담보 토큰 (표시용)
  categoryId: bigint; // 종목군 ID (collateralTokenAddress에서 변경됨)
  collateralTokenAddress: string | null; // 매칭 전에는 null, 매칭 후에는 borrower의 담보 토큰 주소
  collateralAmount: number;
  loanCurrency: string;
  lendTokenAddress: string;
  loanAmount: number;
  interestRate: number;
  maturityDays: number;
  status: 'active' | 'matched' | 'closed' | 'cancelled' | 'liquidated';
  createdAt: number;
  matchedAt?: number;
  expiresAt?: number;
  borrowOfferId?: bigint; // 매칭된 BorrowOffer ID (takeLendOffer로 생성된 경우)
  earlyRepayFeeBps: number; // 중도상환수수료 (basis points, 100 = 1%)
}

