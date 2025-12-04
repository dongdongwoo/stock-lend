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
}

