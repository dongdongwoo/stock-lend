# Lend-Borrow Platform 개발 컨텍스트 요약

## 프로젝트 개요

대출/대여 플랫폼 - 담보 기반 대출 서비스 (Giwa Testnet)

## 완료된 작업

### 1. 인프라 및 설정

- ✅ wagmi + react-query 통합 (`lib/wagmi/`)
- ✅ 기본 폴링 1.5초 설정
- ✅ Giwa Testnet (Chain ID: 91342) 설정

### 2. 온체인 데이터 조회 훅 (wagmi 기반)

- ✅ `useOraclePricesWagmi()` - 오라클 가격 조회
- ✅ `useBorrowOffersWagmi()`, `useLendOffersWagmi()` - 오퍼 조회
- ✅ `useTokenBalancesWagmi()` - 토큰 잔액 조회
- ✅ `useUserBorrowPositions()`, `useUserLendPositions()` - 유저 포지션 조회
- ✅ `useCollateralRiskParamsWagmi()` - 담보 리스크 파라미터 조회 (maxLtvBps, liquidationBps 등)
- ✅ 모든 훅에 1.5초 자동 폴링 적용

### 3. 커스터디 월렛 시스템

- ✅ 유저별 커스터디 월렛 생성/저장 (`lib/wallet/custody.ts`)
  - localStorage에 유저 ID 기반으로 저장: `custody_wallet_{userId}`
  - 로그인 시 자동 생성 및 ETH 전송
  - 계정 전환 시 해당 유저의 월렛 로드/생성
- ✅ ETH 자동 전송 로직
  - 트랜잭션 실행 전 최소 잔액(0.0001 ETH) 확인
  - 부족 시 마스터가 자동 전송
  - 신규 월렛 생성 시 초기 ETH(0.0001) 전송

### 4. 대여(lend) 페이지 - 완전 연동 완료

- ✅ 상품 등록: `createLendOffer` 컨트랙트 호출
  - ETH 확인 → 레거시 연동 → 채권 수정 → Master Mint → Approve → Create
  - 대여 원화 차감 (`updateUserCash`)
  - txSteps 순서대로 진행
- ✅ 상품 수정: `updateLendOffer` 컨트랙트 호출
  - 대여 금액 증가: 레거시 → 채권 수정 → Mint → Approve → Update (추가 원화 차감)
  - 대여 금액 감소: verify → token_transfer → burn → legacy_event → bond_update → tx → settle (burn 완료 직후 원화 반환)
  - 금액 변동 없음: verify → bond_update → update
- ✅ 상품 취소: `cancelLendOffer` 컨트랙트 호출
  - verify → burn → bond_close → cash_transfer → tx
  - burn 완료 직후 대여 원화 반환 (`updateUserCash`)
  - userId 파라미터 전달 및 ETH 잔액 확인 추가
- ✅ 전체 상품/내 Active: 온체인 데이터 조회 (`useLendOffersWagmi`)
  - ACTIVE 상태만 필터링하여 표시
  - 취소된 상품은 자동으로 제외

### 4-1. 대출(borrow) 페이지 - 완전 연동 완료

- ✅ 상품 등록: `createBorrowOffer` 컨트랙트 호출
  - ETH 확인 → 레거시 연동 → 질권설정 → 담보 토큰 Mint → Approve → Create
  - 담보 주식 차감 (`updateUserStocks`)
  - txSteps 순서대로 진행
- ✅ 상품 수정: `updateBorrowOffer` 컨트랙트 호출
  - 담보 증가: 레거시 → 질권설정 → 담보 토큰 Mint → Approve → Update (추가 주식 차감)
  - 담보 감소: verify → burn → legacy_event → pledge_release → stock_return → update (burn 완료 직후 주식 반환)
  - 담보 변동 없음: verify → update
- ✅ 상품 취소: `cancelBorrowOffer` 컨트랙트 호출
  - verify → burn → legacy_read → pledge_release → stock_transfer → tx
  - burn 완료 직후 담보 주식 반환 (`updateUserStocks`)
  - userId 파라미터 전달 및 ETH 잔액 확인 추가
- ✅ 전체 상품/내 Active: 온체인 데이터 조회 (`useBorrowOffersWagmi`)
  - ACTIVE 상태만 필터링하여 표시
  - 취소된 상품은 자동으로 제외
- ✅ 온체인 오라클 가격 사용 (`useOraclePricesWagmi`)

### 5. 어드민 페이지

- ✅ 오라클 가격 관리: 온체인 연동 완료 (`setPrice` 컨트랙트 호출)
- ✅ 컨트랙트 데이터 조회 탭 추가
- ✅ 모바일 반응형 개선
  - 컨트랙트 주소 정보: 모바일에서 세로 레이아웃으로 표시, 긴 주소는 줄바꿈 처리
  - 위험 포지션 기준: Health Factor < 1.2일 때 위험 포지션으로 표시
  - 청산 가능 기준: Health Factor < 1.0일 때 청산 가능

### 6. 포트폴리오 페이지

- ✅ 보유 주식: `COLLATERAL_TOKENS` 목록 사용 (온체인에서 가져온 토큰 목록)
- ✅ 가격: 온체인 오라클 사용
- ✅ 내 대출/대여/청산 히스토리: 온체인 데이터
- ✅ 매칭된 포지션 표시 기능 추가
  - 대출 탭: `useUserBorrowPositions` + `useBorrowerLendPositions` (borrower로서)
  - 대여 탭: `useUserLendPositions` + `useLenderLoanPositions` (lender로서)
  - 포지션 중복 제거: 같은 포지션이 여러 소스에서 올 때 완전히 중복 제거
    - `onChainId`가 있으면 `onChainId` 기준으로 중복 제거 (우선)
    - 같은 포지션이 다른 `onChainId`(Borrow Offer ID vs Lend Offer ID)로 올 수 있으므로 실제 포지션 정보로 식별
    - 고유 키: borrower 주소 + lender 주소 + 담보 + 대출금액 + 이자율 + 만기일 조합
    - `UIBorrowOffer` 우선시 (더 많은 정보 포함, 이자와 HF 조회 가능)
- ✅ 포지션 카드 표시 개선
  - 대출자에게는 "대출 포지션", 대여자에게는 "대여 포지션" 표시
  - 상태 배지: "대여중" 표시
  - 설정 이자율 필드 추가
  - `convertToPosition` 함수: 실제 사용자가 borrower인지 lender인지 확인하여 `type` 설정
  - `PositionCard`: `walletAddress`를 사용하여 borrower/lender 판단
- ✅ Health Factor와 Accrued Interest 온체인 조회
  - `usePositionDataWagmi` 훅 추가
  - Health Factor: 컨트랙트에서 bps 형식(10000 단위)으로 반환되는 값을 10000으로 나누어 사용
  - Health Factor: 소수점 2자리로 표시 (`toFixed(2)`)
  - Health Factor와 Accrued Interest: `type`과 관계없이 `onChainId`가 있으면 온체인에서 조회
  - 온체인 데이터가 없으면 클라이언트에서 계산 (온체인 가격 + 리스크 파라미터 사용)
- ✅ 담보 가치 계산: 온체인 오라클 가격 사용
- ✅ 포지션 중복 제거 로직 개선
  - 여러 소스에서 같은 포지션이 올 때 완전히 중복 제거
  - borrower/lender 주소 + 포지션 정보 조합으로 고유 키 생성
  - 온체인에 실제로 존재하는 포지션만 표시

### 7. 하드코딩 제거

- ✅ 모든 `STOCKS` 참조를 `COLLATERAL_TOKENS`로 변경
- ✅ 삼성전자 하드코딩 제거
- ✅ LTV_MAX 하드코딩 제거 → 온체인 `collateralRiskParams`에서 `maxLtvBps` 조회
  - `useCollateralRiskParamsWagmi()` 훅 추가
  - `create-offer-modal.tsx`, `edit-offer-modal.tsx`에서 동적 LTV 사용

### 8. 레거시 시스템 연동 시뮬레이션

- ✅ 대여 상품 등록 시 레거시 연동 단계 추가 (2~5초 랜덤 대기)
- ✅ 대여 상품 수정 시 레거시 연동 단계 추가

### 9. ABI 및 데이터 파싱 수정

- ✅ `lendingViewer.ts` ABI 필드 순서를 실제 컨트랙트 struct 순서에 맞게 수정
  - LendOffer: earlyRepayFeeBps가 duration 앞으로 이동, state는 마지막
  - BorrowOffer: principalDebt가 interestRateBps 앞으로 이동, state는 마지막
- ✅ `useOffersWagmi.ts`에서 state 필드 접근 로직 개선
  - 필드 이름 및 인덱스 접근 지원
  - state가 0인 경우 디버깅 로그 추가

### 10. 테스트 계정 관리

- ✅ 테스트 계정 생성 기능 추가 (`createTestAccount`)
  - 랜덤 ID 생성 (`test_xxxxx` 형식)
  - 커스터디 월렛 자동 생성 및 ETH 전송
  - 초기 자산 설정 (현금 1천만원, 각 주식 100주)
- ✅ 테스트 계정 삭제 기능 추가
  - 개별 삭제: `removeTestAccount(userId)`
  - 전체 삭제: `clearAllTestAccounts()`
- ✅ 계정 전환 메뉴에서 내 계정과 테스트 계정 구분
- ✅ 박동우 계정(0xC586으로 시작)만 남기고 나머지 삭제 기능
- ✅ 모바일 반응형 개선
  - 모바일에서 계정 전환 메뉴가 화면 밖으로 나가지 않도록 수정
  - 모바일에서는 서브메뉴가 옆으로 나가지 않고 아래로 인라인 펼쳐지도록 변경
  - 데스크톱에서는 기존처럼 서브메뉴로 옆에 표시

### 11. 자산 차감/반환 로직

- ✅ 대출 상품 등록 시: 담보 주식 차감 (`updateUserStocks`)
- ✅ 대여 상품 등록 시: 대여 원화 차감 (`updateUserCash`)
- ✅ 대출 상품 수정 시:
  - 담보 증가: 추가 주식 차감
  - 담보 감소: 감소한 주식 반환 (burn 완료 직후)
- ✅ 대여 상품 수정 시:
  - 대여 금액 증가: 추가 원화 차감
  - 대여 금액 감소: 감소한 원화 반환 (burn 완료 직후)
- ✅ 대출 상품 취소 시: 담보 주식 반환 (burn 완료 직후)
- ✅ 대여 상품 취소 시: 대여 원화 반환 (burn 완료 직후)

### 12. UI/UX 개선

- ✅ 모바일 반응형 개선
  - 어드민 페이지: 컨트랙트 주소 정보 모바일에서 줄바꿈 처리
  - 헤더: 계정 전환 메뉴가 모바일에서 화면 밖으로 나가지 않도록 수정
    - 모바일: 계정 전환 버튼 아래로 인라인 펼침
    - 데스크톱: 기존처럼 서브메뉴로 옆에 표시

## 컨트랙트 정보

### Chain

- **Chain ID**: 91342 (Giwa Testnet)
- **RPC**: https://sepolia-rpc.giwa.io
- **Explorer**: https://sepolia-explorer.giwa.io

### 컨트랙트 주소

- **Oracle**: `0xF3E923123B1D4AC428f287D7C01Cca4A25eAEC66`
- **Collateral Token**: `0xb554941fB2A49F5438d59d42aAD28b55aE05a49e` (한화)
- **Lend Token**: `0xe85963895880ac0925b8fAfB9fe293631C4bE6D7` (dKRW)
- **Lending**: `0x4deAE8151Cd1e0892daA0fD070ff5f36cDe59E43`
- **Lending Viewer**: `0xD17bC8d443712908e4FA8158123e7d10fA83f565`

### 토큰 정보

- **COLLATERAL_TOKENS**: 한화투자증권 (HANHWA)
- **LEND_TOKENS**: dKRW (원화)

### 13. 매칭 기능 컨트랙트 연동 - 완료 ✅

- ✅ **대출 상품 매칭**: `takeBorrowOffer(borrowOfferId, userId)` 컨트랙트 호출
  - 레거시 시스템 연동 시뮬레이션
  - 원화 → dKRW 토큰화 (Master Mint)
  - dKRW 토큰 Approve
  - `takeBorrowOffer` 컨트랙트 호출
  - 대여자 현금 차감
- ✅ **대여 상품 매칭**: `takeLendOffer(lendOfferId, collateralAmount, userId)` 컨트랙트 호출
  - 레거시 시스템 연동 시뮬레이션
  - 담보 주식 질권설정 시뮬레이션
  - 담보 → 담보 토큰화 (Master Mint)
  - 담보 토큰 Approve
  - `takeLendOffer` 컨트랙트 호출 (담보 수량 포함)
  - 대출자 주식 차감 및 현금 증가
- ✅ 온체인 LTV 사용: `useCollateralRiskParamsWagmi` 훅으로 동적 LTV 계산
- ✅ 매칭 모달 개선
  - 대출 상품 매칭 시: 온체인 오라클 가격으로 LTV 계산 (담보 가치 = 담보 수량 × 온체인 가격)
  - 최종 예상 이자 표시: 만기까지의 예상 이자 계산 및 표시 (대출금액 × 이자율 × 만기일수 / 365)
  - 상품 정보: 온체인 데이터로 표시 (담보 가치, LTV 등)
- ✅ 트랜잭션 플로우: 각 단계별 상태 업데이트 및 에러 처리
- ✅ ETH 잔액 확인: 트랜잭션 실행 전 자동 확인 및 전송

## 남은 작업

### 1. 담보 추가/상환 기능 컨트랙트 연동 ⚠️ 다음 작업

- ⏳ **현재 상태**: `components/add-collateral-modal.tsx`, `components/repay-modal.tsx` 미연동
- 📋 **해야 할 작업**:
  - 담보 추가: `addCollateral(borrowOfferId, amount, userId)` 컨트랙트 호출
  - 담보 출금: `withdrawCollateral(borrowOfferId, amount, userId)` 컨트랙트 호출
  - 상환: `repay(borrowOfferId, amount, userId)` 또는 `repayAll(borrowOfferId, userId)` 컨트랙트 호출
  - steps 순서대로 진행하도록 수정
  - 레거시 시스템 연동 시뮬레이션 추가
  - 담보 추가 시 주식 차감, 상환 시 원화 차감 로직 추가

## 주요 파일 구조

### 컨트랙트 관련

- `lib/contracts/config.ts` - 컨트랙트 주소 및 설정
- `lib/contracts/lending.ts` - Lending 컨트랙트 함수들 (모든 write 함수에 `userId` 파라미터 필요)
- `lib/contracts/tokens.ts` - 토큰 관련 함수들 (모든 write 함수에 `userId` 파라미터 필요)
- `lib/contracts/clients.ts` - wagmi 클라이언트 설정

### 월렛 관련

- `lib/wallet/custody.ts` - 커스터디 월렛 관리 (유저별 저장)
  - `loadCustodyWallet(userId)`, `saveCustodyWallet(userId, wallet)`
  - `getCustodyWalletClient(userId)`, `getCustodyWalletAddress(userId)`
  - `ensureEthBalance(userAddress)` - ETH 자동 전송

### 훅 관련

- `lib/hooks/useOraclePricesWagmi.ts` - 오라클 가격 조회
- `lib/hooks/useOffersWagmi.ts` - 오퍼 조회
- `lib/hooks/useTokenBalancesWagmi.ts` - 토큰 잔액 조회
- `lib/hooks/useCollateralRiskParamsWagmi.ts` - 담보 리스크 파라미터 조회 (LTV 등)
- `lib/hooks/useUserPositionsWagmi.ts` - 유저 포지션 조회
  - `useUserBorrowPositions` - borrower로서의 포지션 조회
  - `useUserLendPositions` - lender로서 만든 lend offers 조회
  - `useLenderLoanPositions` - lender로서 대출 상품에 매칭한 경우
  - `useBorrowerLendPositions` - borrower로서 대여 상품에 매칭한 경우
- `lib/hooks/usePositionDataWagmi.ts` - 포지션 데이터 조회
  - Health Factor와 Accrued Interest 온체인 조회
  - Health Factor: 컨트랙트에서 bps 형식(10000 단위)으로 반환되는 값을 10000으로 나누어 사용
  - `type`과 관계없이 `onChainId`가 있으면 조회

### 컴포넌트

- `components/header.tsx` - 헤더 및 네비게이션
  - 계정 전환 메뉴: 내 계정과 테스트 계정 구분 표시
  - 모바일 반응형: 계정 전환 메뉴가 모바일에서는 아래로 펼쳐지도록 변경 (화면 밖으로 나가지 않음)
  - 데스크톱에서는 서브메뉴로 옆에 표시, 모바일에서는 인라인으로 아래 펼침
- `components/create-offer-modal.tsx` - 상품 등록 (대여/대출 모두 완료)
  - 대여: legacy → bond_update → mint → approve → create (원화 차감)
  - 대출: legacy → pledge → tokenize(mint) → approve → create (주식 차감)
  - 온체인 LTV 사용 (`useCollateralRiskParamsWagmi`)
- `components/edit-offer-modal.tsx` - 상품 수정 (대여/대출 모두 완료)
  - 대여: 금액 증가/감소/변동없음 케이스 모두 구현 완료
    - 증가: 원화 차감, 감소: burn 완료 직후 원화 반환
  - 대출: 담보 증가/감소/변동없음 케이스 모두 구현 완료
    - 증가: 주식 차감, 감소: burn 완료 직후 주식 반환
  - 온체인 가격 및 LTV 사용
- `components/cancel-offer-modal.tsx` - 상품 취소 (대여/대출 모두 완료)
  - 대여: verify → burn → bond_close → cash_transfer → tx (burn 완료 직후 원화 반환)
  - 대출: verify → burn → legacy_read → pledge_release → stock_transfer → tx (burn 완료 직후 주식 반환)
- `components/match-modal.tsx` - 매칭 (컨트랙트 연동 완료)
  - 대출 상품 매칭: legacy → tokenize_cash → approve → takeBorrowOffer (원화 차감)
  - 대여 상품 매칭: legacy → pledge → tokenize_collateral → approve → takeLendOffer (주식 차감, 현금 증가)
  - 온체인 LTV 사용: 대출 상품 매칭 시 온체인 오라클 가격으로 LTV 계산
  - 최종 예상 이자 표시: 만기까지의 예상 이자 계산 및 표시
  - 상품 정보: 온체인 데이터로 표시 (담보 가치, LTV 등)
- `components/position-card.tsx` - 포지션 카드
  - 대출자/대여자 구분하여 제목 표시 ("대출 포지션" / "대여 포지션")
  - 상태 배지: "대여중" 표시
  - 설정 이자율 필드 추가
  - Health Factor: 온체인 데이터 우선 사용, 소수점 2자리 표시
  - Accrued Interest: 온체인 데이터 우선 사용
- `components/add-collateral-modal.tsx` - 담보 추가 (컨트랙트 연동 필요)
- `components/repay-modal.tsx` - 상환 (컨트랙트 연동 필요)

## 중요 사항

### 모든 컨트랙트 함수 호출 시

- **필수**: `userId` 파라미터 전달 (커스터디 월렛 접근용)
- **필수**: 트랜잭션 실행 전 `ensureEthBalance(userAddress)` 호출

### 트랜잭션 플로우 패턴

1. ETH 잔액 확인 및 전송
2. 레거시 시스템 연동 (시뮬레이션: 2~5초 랜덤 대기)
3. 토큰 Mint (필요한 경우)
4. 토큰 Approve (필요한 경우)
5. 컨트랙트 함수 호출
6. 트랜잭션 확인
7. 자산 차감/반환 (필요한 경우)
   - 대출 상품 등록/수정(증가): 주식 차감 (`updateUserStocks`)
   - 대여 상품 등록/수정(증가): 원화 차감 (`updateUserCash`)
   - 토큰 burn 완료 직후: 원화/주식 반환

### steps 순서

- 각 모달에서 정의한 `steps` 배열 순서대로 진행
- 각 단계마다 `setTxSteps`로 상태 업데이트
- 레거시 시스템 연동은 시뮬레이션으로 2~5초 랜덤 대기

## 다음 작업 우선순위

1. **담보 추가/상환 기능 컨트랙트 연동** (최우선)

   - `add-collateral-modal.tsx`, `repay-modal.tsx` 컨트랙트 연동
   - steps 순서대로 진행하도록 수정
   - 레거시 시스템 연동 시뮬레이션 추가
   - 담보 추가 시 주식 차감, 상환 시 원화 차감 로직 추가
