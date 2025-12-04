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
  oracle: '0x1722c8e87e3FEd56C52E0a90d3AC8a13917Db2C7' as `0x${string}`,
  collateralToken: '0x54FBA2bb8A4B6AeEdc28273e42aB570BbFA7bc63' as `0x${string}`, // 한화
  lendToken: '0x47a6ab437e3091B05984b4d0aBD26BE647a2Db29' as `0x${string}`, // 원화 S.C (dKRW)
  lending: '0xB0B74258DE452a9b52529C9431d0C29874deAb5b' as `0x${string}`,
  lendingViewer: '0xe113e8Cc63f6BbF72fFB85e74b414cc6C60b0ba2' as `0x${string}`,
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
