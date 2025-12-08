import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { COLLATERAL_TOKENS } from './contracts/config';
import {
  createCustodyWallet,
  loadCustodyWallet,
  saveCustodyWallet,
  fundCustodyWallet,
  ensureEthBalance,
  clearCustodyWallet,
} from './wallet/custody';

export interface Stock {
  symbol: string;
  name: string;
  tokenSymbol: string; // 토큰화시 사용되는 심볼
  price: number;
  icon: string;
}

export const STOCKS: Stock[] = [
  { symbol: 'SAMSUNG', name: '삼성전자', tokenSymbol: 'xSamsung', price: 72000, icon: '📈' },
  { symbol: 'HANHWA', name: '한화투자증권', tokenSymbol: 'xHanhwa', price: 45000, icon: '🏦' },
];

export interface Currency {
  symbol: string;
  name: string;
  tokenSymbol: string;
  rate: number; // 1원 = 1 dKRW
  icon: string;
}

export const CURRENCIES: Currency[] = [
  { symbol: 'KRW', name: '원화', tokenSymbol: 'dKRW', rate: 1, icon: '🇰🇷' },
];

export interface TestAccount {
  id: string;
  username: string;
  description: string;
}

export const TEST_ACCOUNTS: TestAccount[] = [];

export interface User {
  id: string;
  username: string;
  wallet: string;
  cash: number; // 현금 (원화)
  stocks: {
    [stockSymbol: string]: number; // 주식 보유량
  };
}

export interface BorrowOffer {
  id: string;
  borrowerId: string;
  borrowerWallet: string;
  collateralStock: string; // 실물 주식 심볼 (SAMSUNG 등)
  collateralAmount: number;
  loanCurrency: string; // 대출받을 통화 (KRW)
  loanAmount: number;
  interestRate: number;
  maturityDays: number;
  ltv: number;
  status: 'active' | 'matched' | 'closed' | 'liquidated';
  createdAt: number;
  matchedAt?: number;
  matchedWith?: string;
  txHash?: string;
}

export interface LendOffer {
  id: string;
  lenderId: string;
  lenderWallet: string;
  loanCurrency: string; // 대여할 통화 (KRW)
  loanAmount: number;
  requestedCollateralStock: string; // 요청하는 담보 주식
  interestRate: number;
  maturityDays: number;
  status: 'active' | 'matched' | 'closed' | 'liquidated';
  createdAt: number;
  matchedAt?: number;
  matchedWith?: string;
  txHash?: string;
}

export interface Position {
  id: string;
  type: 'borrow' | 'lend';
  borrowerId: string;
  lenderId: string;
  collateralStock: string;
  collateralAmount: number;
  loanCurrency: string;
  loanAmount: number;
  interestRate: number;
  maturityDate: number;
  matchedAt: number;
  status: 'open' | 'closed' | 'liquidated';
  accruedInterest: number;
  healthFactor: number;
  liquidationPrice: number;
  txHash: string;
}

export interface OraclePrice {
  [stockSymbol: string]: number;
  lastUpdated: number;
}

interface AppState {
  user: User | null;
  allUsers: { [userId: string]: User };
  borrowOffers: BorrowOffer[];
  lendOffers: LendOffer[];
  positions: Position[];
  oraclePrice: OraclePrice;
  isConnecting: boolean;
  txPending: boolean;

  // Actions
  setUser: (user: User | null) => void;
  switchUser: (userId: string) => Promise<void>;
  createTestAccount: () => Promise<void>;
  clearAllTestAccounts: () => void;
  removeTestAccount: (userId: string) => void;
  clearAllAccountsExceptPark: () => void;
  saveCurrentUser: () => void;
  setConnecting: (connecting: boolean) => void;
  setTxPending: (pending: boolean) => void;
  logout: () => void;

  addBorrowOffer: (offer: BorrowOffer) => void;
  updateBorrowOffer: (id: string, updates: Partial<BorrowOffer>) => void;
  removeBorrowOffer: (id: string) => void;

  addLendOffer: (offer: LendOffer) => void;
  updateLendOffer: (id: string, updates: Partial<LendOffer>) => void;
  removeLendOffer: (id: string) => void;

  addPosition: (position: Position) => void;
  updatePosition: (id: string, updates: Partial<Position>) => void;

  updateOraclePrice: (prices: Partial<OraclePrice>) => void;
  updateUserCash: (amount: number) => void;
  updateUserStocks: (stockSymbol: string, amount: number) => void;
}

const LTV_MAX = 0.7;
const LIQUIDATION_THRESHOLD = 0.85;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      allUsers: {},
      borrowOffers: [],
      lendOffers: [],
      positions: [],
      oraclePrice: {
        SAMSUNG: 72000,
        HANHWA: 45000,
        lastUpdated: Date.now(),
      },
      isConnecting: false,
      txPending: false,

      setUser: (user) => set({ user }),

      switchUser: async (userId) => {
        const state = get();
        const newAllUsers = { ...state.allUsers };

        // 현재 유저 저장
        if (state.user) {
          newAllUsers[state.user.id] = state.user;
        }

        // 저장된 유저가 있으면 불러오고, 없으면 에러 (자동 생성하지 않음)
        const existingUser = newAllUsers[userId];
        if (!existingUser) {
          throw new Error(`User ${userId} not found. Please create the account first.`);
        }

        // 기존 유저: 커스터디 월렛 로드 또는 생성
        let custodyWallet = loadCustodyWallet(userId);
        let isNewWallet = false;

        if (!custodyWallet) {
          // 새 월렛 생성
          custodyWallet = createCustodyWallet();
          saveCustodyWallet(userId, custodyWallet);
          isNewWallet = true;
        }

        // ETH 잔액 확인 및 전송 (백그라운드에서 처리, 에러는 무시)
        try {
          if (isNewWallet) {
            await fundCustodyWallet(custodyWallet.address);
          } else {
            await ensureEthBalance(custodyWallet.address);
          }
        } catch (error) {
          console.error('Failed to fund wallet:', error);
          // 에러가 발생해도 계속 진행
        }

        // 유저의 wallet 주소를 커스터디 월렛 주소로 업데이트
        const updatedUser = {
          ...existingUser,
          wallet: custodyWallet.address,
        };
        newAllUsers[userId] = updatedUser;
        set({ user: updatedUser, allUsers: newAllUsers });
      },

      saveCurrentUser: () => {
        const state = get();
        if (state.user) {
          set({
            allUsers: {
              ...state.allUsers,
              [state.user.id]: state.user,
            },
          });
        }
      },

      createTestAccount: async () => {
        const state = get();
        const newAllUsers = { ...state.allUsers };

        // 현재 유저 저장
        if (state.user) {
          newAllUsers[state.user.id] = state.user;
        }

        // 랜덤 유저 ID 생성
        const userId = `test_${Math.random().toString(36).substring(2, 11)}`;
        const username = `테스트유저_${userId.slice(-4)}`;

        // 커스터디 월렛 생성
        const custodyWallet = createCustodyWallet();
        saveCustodyWallet(userId, custodyWallet);

        // ETH 전송 (백그라운드에서 처리, 에러는 무시)
        try {
          await fundCustodyWallet(custodyWallet.address);
        } catch (error) {
          console.error('Failed to fund wallet:', error);
          // 에러가 발생해도 계속 진행
        }

        // 초기 주식 보유량 설정
        const stocks: { [key: string]: number } = {};
        COLLATERAL_TOKENS.forEach((token) => {
          stocks[token.symbol] = 100; // 각 주식 100주씩 보유
        });

        const newUser: User = {
          id: userId,
          username,
          wallet: custodyWallet.address,
          cash: 30000000, // 3천만원 보유
          stocks,
        };

        newAllUsers[userId] = newUser;
        set({ user: newUser, allUsers: newAllUsers });
      },

      clearAllTestAccounts: () => {
        const state = get();
        const newAllUsers = { ...state.allUsers };
        let currentUser = state.user;

        // 테스트 계정 필터링 (test_로 시작하는 ID)
        const testAccountIds = Object.keys(newAllUsers).filter((id) => id.startsWith('test_'));

        // 테스트 계정 삭제 및 커스터디 월렛 삭제
        testAccountIds.forEach((userId) => {
          delete newAllUsers[userId];
          clearCustodyWallet(userId);
        });

        // 현재 유저가 테스트 계정이면 로그아웃
        if (currentUser && currentUser.id.startsWith('test_')) {
          currentUser = null;
        }

        set({ user: currentUser, allUsers: newAllUsers });
      },

      removeTestAccount: (userId: string) => {
        const state = get();
        const newAllUsers = { ...state.allUsers };
        let currentUser = state.user;

        // 테스트 계정인지 확인
        if (!userId.startsWith('test_')) {
          throw new Error('Only test accounts can be removed using this function');
        }

        // 계정 삭제
        delete newAllUsers[userId];
        clearCustodyWallet(userId);

        // 현재 유저가 삭제된 계정이면 로그아웃
        if (currentUser && currentUser.id === userId) {
          currentUser = null;
        }

        set({ user: currentUser, allUsers: newAllUsers });
      },

      clearAllAccountsExceptPark: () => {
        const state = get();
        const newAllUsers = { ...state.allUsers };
        let currentUser = state.user;

        // 박동우 계정 찾기 (wallet 주소가 0xC586으로 시작)
        const parkAccount = Object.values(newAllUsers).find((user) =>
          user.wallet.toLowerCase().startsWith('0xc586'),
        );

        // 박동우 계정만 남기고 나머지 모두 삭제
        const accountsToDelete = Object.keys(newAllUsers).filter((userId) => {
          const user = newAllUsers[userId];
          // 박동우 계정이 아니고, 테스트 계정도 아닌 경우 삭제
          return !user.wallet.toLowerCase().startsWith('0xc586') && !userId.startsWith('test_');
        });

        // 계정 삭제 및 커스터디 월렛 삭제
        accountsToDelete.forEach((userId) => {
          delete newAllUsers[userId];
          clearCustodyWallet(userId);
        });

        // 현재 유저가 삭제된 계정이면 박동우 계정으로 전환, 없으면 null
        if (currentUser && accountsToDelete.includes(currentUser.id)) {
          currentUser = parkAccount || null;
        }

        set({ user: currentUser, allUsers: newAllUsers });
      },

      setConnecting: (connecting) => set({ isConnecting: connecting }),
      setTxPending: (pending) => set({ txPending: pending }),
      logout: () => {
        // 로컬스토리지에서 모든 계정 정보 삭제
        if (typeof window !== 'undefined') {
          // zustand persist 스토리지 삭제
          localStorage.removeItem('lending-protocol-storage');

          // 커스터디 월렛 관련 로컬스토리지도 삭제
          // custody.ts에서 사용하는 키들을 확인하여 삭제
          const custodyKeys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('custody-wallet-') || key.startsWith('custody-'))) {
              custodyKeys.push(key);
            }
          }
          custodyKeys.forEach((key) => localStorage.removeItem(key));
        }

        // 상태 초기화
        set({
          user: null,
          allUsers: {},
          borrowOffers: [],
          lendOffers: [],
          positions: [],
        });
      },

      addBorrowOffer: (offer) =>
        set((state) => ({
          borrowOffers: [...state.borrowOffers, offer],
        })),

      updateBorrowOffer: (id, updates) =>
        set((state) => ({
          borrowOffers: state.borrowOffers.map((o) => (o.id === id ? { ...o, ...updates } : o)),
        })),

      removeBorrowOffer: (id) =>
        set((state) => ({
          borrowOffers: state.borrowOffers.filter((o) => o.id !== id),
        })),

      addLendOffer: (offer) =>
        set((state) => ({
          lendOffers: [...state.lendOffers, offer],
        })),

      updateLendOffer: (id, updates) =>
        set((state) => ({
          lendOffers: state.lendOffers.map((o) => (o.id === id ? { ...o, ...updates } : o)),
        })),

      removeLendOffer: (id) =>
        set((state) => ({
          lendOffers: state.lendOffers.filter((o) => o.id !== id),
        })),

      addPosition: (position) =>
        set((state) => ({
          positions: [...state.positions, position],
        })),

      updatePosition: (id, updates) =>
        set((state) => ({
          positions: state.positions.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      updateOraclePrice: (prices) =>
        set((state) => {
          const newPrices: OraclePrice = {
            ...state.oraclePrice,
            ...prices,
            lastUpdated: Date.now(),
          };

          // 레거시 함수: updateOraclePrice는 더 이상 사용되지 않음
          // 포지션 업데이트는 온체인 데이터를 직접 사용하는 컴포넌트에서 처리됨
          const updatedPositions = state.positions.map((p) => {
            if (p.status !== 'open') return p;

            // 가격이 있으면 업데이트, 없으면 기존 값 유지
            const price = newPrices[p.collateralStock];
            if (price === undefined) return p;

            const collateralValue = p.collateralAmount * price;
            const debtValue = p.loanAmount + p.accruedInterest;
            const healthFactor = collateralValue / (debtValue * LIQUIDATION_THRESHOLD);
            const liquidationPrice = (debtValue * LIQUIDATION_THRESHOLD) / p.collateralAmount;

            return { ...p, healthFactor, liquidationPrice };
          });

          return { oraclePrice: newPrices, positions: updatedPositions };
        }),

      updateUserCash: (amount) =>
        set((state) => {
          if (!state.user) return state;
          const updatedUser = {
            ...state.user,
            cash: (state.user.cash || 0) + amount,
          };
          return { user: updatedUser };
        }),

      updateUserStocks: (stockSymbol, amount) =>
        set((state) => {
          if (!state.user) return state;
          const updatedUser = {
            ...state.user,
            stocks: {
              ...(state.user.stocks || {}),
              [stockSymbol]: ((state.user.stocks || {})[stockSymbol] || 0) + amount,
            },
          };
          return { user: updatedUser };
        }),
    }),
    {
      name: 'lending-protocol-storage',
      partialize: (state) => ({
        user: state.user,
        allUsers: state.allUsers,
        borrowOffers: state.borrowOffers,
        lendOffers: state.lendOffers,
        positions: state.positions,
        oraclePrice: state.oraclePrice,
      }),
    },
  ),
);

export { LTV_MAX, LIQUIDATION_THRESHOLD };
