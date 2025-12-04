// Giwa Testnet 체인 설정
export const GIWA_TESTNET = {
  id: 91342,
  name: 'Giwa Testnet',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://sepolia-rpc.giwa.io'] },
  },
  blockExplorers: {
    default: { name: 'Giwa Explorer', url: 'https://sepolia-explorer.giwa.io' },
  },
} as const;

// 컨트랙트 주소
export const CONTRACTS = {
  oracle: '0xe57a9A92090D4cF7832f5326EeBAc4867B9521c3' as `0x${string}`,
  collateralToken: '0xD26E69DA91a33735aB3B3EC83475B24ED74Be1ff' as `0x${string}`, // 한화
  lendToken: '0x557Cfb3FE5824f79cb761324Dd70d53d1D55f356' as `0x${string}`, // 원화 S.C (dKRW)
  lending: '0xf14A98F868066D7c4448F2141739Bde66738D711' as `0x${string}`,
  lendingViewer: '0x526c81c4cCF9EdABE2D68ca147737eDCD4c8029e' as `0x${string}`,
} as const;

// 토큰 주소 → UI 심볼 매핑
export const TOKEN_ADDRESS_TO_SYMBOL: Record<string, string> = {
  [CONTRACTS.collateralToken.toLowerCase()]: 'HANHWA',
  [CONTRACTS.lendToken.toLowerCase()]: 'KRW',
};

// UI 심볼 → 토큰 주소 매핑
export const SYMBOL_TO_TOKEN_ADDRESS: Record<string, `0x${string}`> = {
  HANHWA: CONTRACTS.collateralToken,
  KRW: CONTRACTS.lendToken,
};

// 담보 토큰 정보
export interface CollateralTokenInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
}

export const COLLATERAL_TOKENS: CollateralTokenInfo[] = [
  {
    address: CONTRACTS.collateralToken,
    symbol: 'HANHWA',
    name: '한화투자증권',
    icon: '🏦',
    decimals: 18,
  },
];

// 대여 토큰 정보
export interface LendTokenInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
}

export const LEND_TOKENS: LendTokenInfo[] = [
  {
    address: CONTRACTS.lendToken,
    symbol: 'dKRW',
    name: '원화 (dKRW)',
    icon: '🇰🇷',
    decimals: 18,
  },
];

// 토큰 주소로 정보 찾기
export function getCollateralTokenByAddress(address: string): CollateralTokenInfo | undefined {
  return COLLATERAL_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

export function getLendTokenByAddress(address: string): LendTokenInfo | undefined {
  return LEND_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

// 온체인 주소 배열을 토큰 정보 배열로 변환하는 헬퍼 함수
export function mapCollateralTokens(addresses: `0x${string}`[]): CollateralTokenInfo[] {
  return addresses
    .map((address) => {
      const token = getCollateralTokenByAddress(address);
      if (!token) {
        // 메타데이터가 없는 경우 기본값 사용
        return {
          address,
          symbol: address.slice(0, 6) + '...',
          name: 'Unknown Token',
          icon: '❓',
          decimals: 18,
        };
      }
      return token;
    })
    .filter((token) => token !== undefined) as CollateralTokenInfo[];
}

export function mapLendTokens(addresses: `0x${string}`[]): LendTokenInfo[] {
  return addresses
    .map((address) => {
      const token = getLendTokenByAddress(address);
      if (!token) {
        // 메타데이터가 없는 경우 기본값 사용
        return {
          address,
          symbol: address.slice(0, 6) + '...',
          name: 'Unknown Token',
          icon: '❓',
          decimals: 18,
        };
      }
      return token;
    })
    .filter((token) => token !== undefined) as LendTokenInfo[];
}

// 초기 ETH 전송량 (신규 지갑 생성 시)
export const INITIAL_ETH_AMOUNT = '0.0001';
// 트랜잭션 실행을 위한 최소 ETH 잔액
export const MIN_ETH_BALANCE = '0.0001';

// 마스터 지갑 PK (클라이언트에서 접근 - 테스트넷 전용!)
export const MASTER_PRIVATE_KEY = process.env.NEXT_PUBLIC_MASTER_PRIVATE_KEY as `0x${string}`;

// BPS 상수
export const BPS_DENOMINATOR = BigInt(10000);
