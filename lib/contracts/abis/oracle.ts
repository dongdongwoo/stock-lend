// ManualPriceOracle ABI
export const oracleAbi = [
  // Read functions
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Write functions
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'price', type: 'uint256' },
    ],
    name: 'setPrice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'asset', type: 'address' },
      { indexed: false, name: 'price', type: 'uint256' },
      { indexed: true, name: 'updater', type: 'address' },
    ],
    name: 'PriceUpdated',
    type: 'event',
  },
] as const;
