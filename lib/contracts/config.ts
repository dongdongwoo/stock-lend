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
  oracle: '0xad6fFD94a89456a8172d73437b2543e6C2e782eD' as `0x${string}`,
  // A군 담보토큰
  collateralTokenA1: '0xD531414bb56a2B2eBB65388E9CB6609E32c44d80' as `0x${string}`, // 한화
  collateralTokenA2: '0x4eDd339d44DC00A5B13d43e9e742252CD43a3Ad8' as `0x${string}`, // 네이버
  collateralTokenA3: '0x74d8D3C387a6f19584938219d7F8fB892C199f50' as `0x${string}`, // 두나무
  // B군 담보토큰
  collateralTokenB1: '0xa490f88Ff8C497E5648f8B28d7706CfbD0cb738F' as `0x${string}`, // 카카오
  collateralTokenB2: '0x7e2E39613ba814D7C8C9dA2c30b43e8651CbC3B4' as `0x${string}`, // 엘지
  // C군 담보토큰
  collateralTokenC1: '0xE32067a9EE975c9d56FF57Bb2326a441322aA036' as `0x${string}`, // 쿠팡
  collateralTokenC2: '0x32e5Fc32FF1776e386aA83Ce76197bB32f046ED3' as `0x${string}`, // 위메이드
  // 대여토큰
  lendToken: '0x186E976A133d2592C0c1818Fdf4887d9A23329cD' as `0x${string}`, // 원화 S.C (dKRW)
  // 컨트랙트
  lending: '0xEF7B076977d446623064A3BAcc213bbf2043B02b' as `0x${string}`,
  lendingViewer: '0xEdb4487b496e32C67b7b827858a8C26DBDFBD70D' as `0x${string}`,
  lendingConfig: '0x1e9EF36D9Cc92246D5698d94992A91603B47CB4e' as `0x${string}`,
  // Multicall3
  multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`,
} as const;

// 토큰 주소 → UI 심볼 매핑
export const TOKEN_ADDRESS_TO_SYMBOL: Record<string, string> = {
  [CONTRACTS.collateralTokenA1.toLowerCase()]: 'HANHWA',
  [CONTRACTS.collateralTokenA2.toLowerCase()]: 'NAVER',
  [CONTRACTS.collateralTokenA3.toLowerCase()]: 'DUNUMU',
  [CONTRACTS.collateralTokenB1.toLowerCase()]: 'KAKAO',
  [CONTRACTS.collateralTokenB2.toLowerCase()]: 'LG',
  [CONTRACTS.collateralTokenC1.toLowerCase()]: 'COUPANG',
  [CONTRACTS.collateralTokenC2.toLowerCase()]: 'WEMADE',
  [CONTRACTS.lendToken.toLowerCase()]: 'KRW',
};

// UI 심볼 → 토큰 주소 매핑
export const SYMBOL_TO_TOKEN_ADDRESS: Record<string, `0x${string}`> = {
  HANHWA: CONTRACTS.collateralTokenA1,
  NAVER: CONTRACTS.collateralTokenA2,
  DUNUMU: CONTRACTS.collateralTokenA3,
  KAKAO: CONTRACTS.collateralTokenB1,
  LG: CONTRACTS.collateralTokenB2,
  COUPANG: CONTRACTS.collateralTokenC1,
  WEMADE: CONTRACTS.collateralTokenC2,
  KRW: CONTRACTS.lendToken,
};

// 담보 토큰 정보
export interface CollateralTokenInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
  categoryId?: bigint; // 카테고리 ID (A군=0, B군=1, C군=2 등)
}

export const COLLATERAL_TOKENS: CollateralTokenInfo[] = [
  // A군
  {
    address: CONTRACTS.collateralTokenA1,
    symbol: 'HANHWA',
    name: '한화투자증권',
    icon: '/hanwha.png',
    decimals: 18,
    categoryId: BigInt(1), // A군
  },
  {
    address: CONTRACTS.collateralTokenA2,
    symbol: 'NAVER',
    name: '네이버',
    icon: '/naver.png',
    decimals: 18,
    categoryId: BigInt(1), // A군
  },
  {
    address: CONTRACTS.collateralTokenA3,
    symbol: 'DUNUMU',
    name: '두나무',
    icon: '/dunamu.jpeg',
    decimals: 18,
    categoryId: BigInt(1), // A군
  },
  // B군
  {
    address: CONTRACTS.collateralTokenB1,
    symbol: 'KAKAO',
    name: '카카오',
    icon: '/kakao.jpeg',
    decimals: 18,
    categoryId: BigInt(2), // B군
  },
  {
    address: CONTRACTS.collateralTokenB2,
    symbol: 'LG',
    name: '엘지',
    icon: '/lg.png',
    decimals: 18,
    categoryId: BigInt(2), // B군
  },
  // C군
  {
    address: CONTRACTS.collateralTokenC1,
    symbol: 'COUPANG',
    name: '쿠팡',
    icon: '/coupang.png',
    decimals: 18,
    categoryId: BigInt(3), // C군
  },
  {
    address: CONTRACTS.collateralTokenC2,
    symbol: 'WEMADE',
    name: '위메이드',
    icon: '/wemade.png',
    decimals: 18,
    categoryId: BigInt(3), // C군
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

// 카테고리 ID → 카테고리 이름 매핑
export const CATEGORY_NAMES: Record<string, string> = {
  '1': 'A군',
  '2': 'B군',
  '3': 'C군',
};

// 카테고리 이름 → 카테고리 ID 매핑
export const CATEGORY_IDS: Record<string, bigint> = {
  A군: BigInt(1),
  B군: BigInt(2),
  C군: BigInt(3),
};

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
          icon: '/placeholder-logo.png',
          decimals: 18,
        };
      }
      return token;
    })
    .filter((token) => token !== undefined) as CollateralTokenInfo[];
}

// 카테고리별로 토큰을 그룹화하는 헬퍼 함수
export function groupTokensByCategory(
  tokens: CollateralTokenInfo[],
): Record<string, CollateralTokenInfo[]> {
  const grouped: Record<string, CollateralTokenInfo[]> = {};
  tokens.forEach((token) => {
    if (token.categoryId !== undefined) {
      const categoryKey = token.categoryId.toString();
      const categoryName = CATEGORY_NAMES[categoryKey] || `카테고리 ${categoryKey}`;
      if (!grouped[categoryName]) {
        grouped[categoryName] = [];
      }
      grouped[categoryName].push(token);
    }
  });
  return grouped;
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
          icon: '/placeholder-logo.png',
          decimals: 18,
        };
      }
      return token;
    })
    .filter((token) => token !== undefined) as LendTokenInfo[];
}

// 초기 ETH 전송량 (신규 지갑 생성 시)
export const INITIAL_ETH_AMOUNT = '0.0003';
// 트랜잭션 실행을 위한 최소 ETH 잔액
export const MIN_ETH_BALANCE = '0.0003';

// 마스터 지갑 PK (클라이언트에서 접근 - 테스트넷 전용!)
export const MASTER_PRIVATE_KEY = process.env.NEXT_PUBLIC_MASTER_PRIVATE_KEY as `0x${string}`;

// BPS 상수
export const BPS_DENOMINATOR = BigInt(10000);
