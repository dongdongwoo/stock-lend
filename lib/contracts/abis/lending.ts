// StockLending ABI

// OfferState enum: None=0, Active=1, Matched=2, Closed=3, Cancelled=4, Liquidated=5
// CollateralBurnReason enum: Cancelled=0, Repaid=1, LiquidationSeized=2, LiquidationRefund=3, Reduced=4

export const lendingAbi = [
  // ============ Read Functions ============
  {
    inputs: [],
    name: 'oracle',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'reserveWallet',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextBorrowOfferId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextLendOfferId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'isCollateralToken',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'isLendToken',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllowedCollateralTokens',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllowedLendTokens',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'uint256' }],
    name: 'borrowOffers',
    outputs: [
      {
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'borrower', type: 'address' },
          { name: 'lender', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'lendToken', type: 'address' },
          { name: 'collateralAmount', type: 'uint256' },
          { name: 'loanAmount', type: 'uint256' },
          { name: 'principalDebt', type: 'uint256' },
          { name: 'interestRateBps', type: 'uint256' },
          { name: 'duration', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'matchedAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'lastInterestTimestamp', type: 'uint256' },
          { name: 'earlyRepayFeeBps', type: 'uint256' },
          { name: 'interestPaid', type: 'uint256' },
          { name: 'state', type: 'uint8' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'uint256' }],
    name: 'lendOffers',
    outputs: [
      {
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'lender', type: 'address' },
          { name: 'borrower', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'lendToken', type: 'address' },
          { name: 'collateralAmount', type: 'uint256' },
          { name: 'loanAmount', type: 'uint256' },
          { name: 'interestRateBps', type: 'uint256' },
          { name: 'earlyRepayFeeBps', type: 'uint256' },
          { name: 'duration', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'matchedAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'state', type: 'uint8' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'borrowOfferId', type: 'uint256' }],
    name: 'accruedInterest',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'borrowOfferId', type: 'uint256' }],
    name: 'outstandingDebt',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'borrowOfferId', type: 'uint256' }],
    name: 'currentHealthFactor',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'collateralRiskParams',
    outputs: [
      { name: 'maxLtvBps_', type: 'uint256' },
      { name: 'liquidationBps_', type: 'uint256' },
      { name: 'liquidationPenaltyBps_', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },

  // ============ Write Functions ============
  // Borrow Offer Lifecycle
  {
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'lendToken', type: 'address' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'loanAmount', type: 'uint256' },
      { name: 'interestRateBps', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'earlyRepayFeeBps', type: 'uint256' },
    ],
    name: 'createBorrowOffer',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'offerId', type: 'uint256' },
      { name: 'newCollateralAmount', type: 'uint256' },
      { name: 'newLoanAmount', type: 'uint256' },
      { name: 'newInterestRateBps', type: 'uint256' },
      { name: 'newDuration', type: 'uint256' },
      { name: 'newEarlyRepayFeeBps', type: 'uint256' },
    ],
    name: 'updateBorrowOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'offerId', type: 'uint256' }],
    name: 'cancelBorrowOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // Lend Offer Lifecycle
  {
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'lendToken', type: 'address' },
      { name: 'loanAmount', type: 'uint256' },
      { name: 'interestRateBps', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'earlyRepayFeeBps', type: 'uint256' },
    ],
    name: 'createLendOffer',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'offerId', type: 'uint256' },
      { name: 'newLoanAmount', type: 'uint256' },
      { name: 'newInterestRateBps', type: 'uint256' },
      { name: 'newDuration', type: 'uint256' },
      { name: 'newEarlyRepayFeeBps', type: 'uint256' },
    ],
    name: 'updateLendOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'offerId', type: 'uint256' }],
    name: 'cancelLendOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // Matching
  {
    inputs: [{ name: 'borrowOfferId', type: 'uint256' }],
    name: 'takeBorrowOffer',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'lendOfferId', type: 'uint256' },
      { name: 'collateralAmount', type: 'uint256' },
    ],
    name: 'takeLendOffer',
    outputs: [{ name: 'borrowOfferId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // Repayment
  {
    inputs: [
      { name: 'borrowOfferId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'repay',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'borrowOfferId', type: 'uint256' }],
    name: 'repayAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // Liquidation
  {
    inputs: [{ name: 'borrowOfferId', type: 'uint256' }],
    name: 'liquidate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // Collateral Management
  {
    inputs: [
      { name: 'borrowOfferId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'addCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'borrowOfferId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'withdrawCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // Admin Functions
  {
    inputs: [{ name: 'newOracle', type: 'address' }],
    name: 'setOracle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    name: 'setCollateralToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    name: 'setLendToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newReserveWallet', type: 'address' }],
    name: 'setReserveWallet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'newMaxLtvBps', type: 'uint256' },
      { name: 'newLiquidationBps', type: 'uint256' },
      { name: 'newLiquidationPenaltyBps', type: 'uint256' },
    ],
    name: 'setCollateralRiskParams',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // ============ Events ============
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'offerId', type: 'uint256' },
      { indexed: true, name: 'borrower', type: 'address' },
      { indexed: false, name: 'collateralAmount', type: 'uint256' },
      { indexed: false, name: 'loanAmount', type: 'uint256' },
    ],
    name: 'BorrowOfferCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'offerId', type: 'uint256' },
      { indexed: false, name: 'collateralAmount', type: 'uint256' },
      { indexed: false, name: 'loanAmount', type: 'uint256' },
      { indexed: false, name: 'interestRateBps', type: 'uint256' },
      { indexed: false, name: 'duration', type: 'uint256' },
    ],
    name: 'BorrowOfferUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: 'offerId', type: 'uint256' }],
    name: 'BorrowOfferCancelled',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'offerId', type: 'uint256' },
      { indexed: true, name: 'lender', type: 'address' },
      { indexed: false, name: 'loanAmount', type: 'uint256' },
    ],
    name: 'LendOfferCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'offerId', type: 'uint256' },
      { indexed: false, name: 'loanAmount', type: 'uint256' },
      { indexed: false, name: 'interestRateBps', type: 'uint256' },
      { indexed: false, name: 'duration', type: 'uint256' },
    ],
    name: 'LendOfferUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: 'offerId', type: 'uint256' }],
    name: 'LendOfferCancelled',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'offerId', type: 'uint256' },
      { indexed: true, name: 'lender', type: 'address' },
      { indexed: true, name: 'lendToken', type: 'address' },
      { indexed: false, name: 'reserveWallet', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'isCancellation', type: 'bool' },
    ],
    name: 'LendOfferFundsForwarded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'borrowOfferId', type: 'uint256' },
      { indexed: true, name: 'lendOfferId', type: 'uint256' },
      { indexed: true, name: 'taker', type: 'address' },
    ],
    name: 'OffersMatched',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'borrowOfferId', type: 'uint256' },
      { indexed: true, name: 'payer', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'LoanRepaid',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'borrowOfferId', type: 'uint256' },
      { indexed: true, name: 'liquidator', type: 'address' },
      { indexed: false, name: 'repayAmount', type: 'uint256' },
      { indexed: false, name: 'collateralSeized', type: 'uint256' },
    ],
    name: 'LoanLiquidated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'borrowOfferId', type: 'uint256' },
      { indexed: false, name: 'newCollateralAmount', type: 'uint256' },
      { indexed: false, name: 'isIncrease', type: 'bool' },
    ],
    name: 'CollateralAdjusted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'reason', type: 'uint8' },
    ],
    name: 'CollateralBurned',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: 'newOracle', type: 'address' }],
    name: 'OracleUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'allowed', type: 'bool' },
    ],
    name: 'CollateralTokenStatusUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'allowed', type: 'bool' },
    ],
    name: 'LendTokenStatusUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: 'newReserveWallet', type: 'address' }],
    name: 'ReserveWalletUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'maxLtvBps', type: 'uint256' },
      { indexed: false, name: 'liquidationBps', type: 'uint256' },
      { indexed: false, name: 'liquidationPenaltyBps', type: 'uint256' },
    ],
    name: 'CollateralRiskUpdated',
    type: 'event',
  },
] as const;
