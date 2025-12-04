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
  requestedCollateralStock: string;
  collateralTokenAddress: string;
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

