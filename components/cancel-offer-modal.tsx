'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStore, type BorrowOffer, type LendOffer } from '@/lib/store';
import { mapCollateralTokens } from '@/lib/contracts/config';
import { TransactionModal, type TxStep } from './transaction-modal';
import { useAllowedCollateralTokensWagmi } from '@/lib/hooks';
import { AlertTriangle } from 'lucide-react';
import {
  cancelLendOffer as cancelLendOfferContract,
  cancelBorrowOffer as cancelBorrowOfferContract,
} from '@/lib/contracts/lending';
import { getCustodyWalletAddress, ensureEthBalance } from '@/lib/wallet/custody';

interface CancelOfferModalProps {
  open: boolean;
  onClose: () => void;
  offer: BorrowOffer | LendOffer | null;
  type: 'borrow' | 'lend';
}

export function CancelOfferModal({ open, onClose, offer, type }: CancelOfferModalProps) {
  const { user, updateUserCash, updateUserStocks } = useStore();
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi();

  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses);

  const [showTx, setShowTx] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [txHash, setTxHash] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // offer가 열릴 때 캐시 (ref로 관리하여 리렌더 방지)
  const cachedOfferRef = useRef<BorrowOffer | LendOffer | null>(null);

  useEffect(() => {
    if (open && offer) {
      cachedOfferRef.current = offer;
    }
  }, [open, offer]);

  const activeOffer = cachedOfferRef.current || offer;

  if (!open && !showTx) return null;
  if (!activeOffer) return null;

  const isBorrow = type === 'borrow';
  const borrowOffer = activeOffer as BorrowOffer;
  const lendOffer = activeOffer as LendOffer;

  const stock = isBorrow
    ? collateralTokens.find((s) => s.symbol === borrowOffer.collateralStock)
    : null;

  const handleCancel = async () => {
    setShowTx(true);
    setIsComplete(false);
    setTxError(null);

    const steps: TxStep[] = isBorrow
      ? [
          { id: 'verify', label: '상품 정보 확인', status: 'active' },
          { id: 'burn', label: '담보토큰 Burn', status: 'pending' },
          { id: 'legacy_read', label: '레거시 시스템 이벤트 수신', status: 'pending' },
          { id: 'pledge_release', label: '질권 해제', status: 'pending' },
          { id: 'stock_transfer', label: '담보 주식 유저에게 전달', status: 'pending' },
          { id: 'tx', label: '정산 완료', status: 'pending' },
        ]
      : [
          { id: 'verify', label: '상품 정보 확인', status: 'active' },
          { id: 'burn', label: '대여토큰(dKRW) Burn', status: 'pending' },
          { id: 'bond_close', label: '채권 종료', status: 'pending' },
          { id: 'cash_transfer', label: '원화 유저에게 전달', status: 'pending' },
          { id: 'tx', label: '정산 완료', status: 'pending' },
        ];

    setTxSteps(steps);

    try {
      // 유저 확인
      if (!user?.id) {
        throw new Error('No user logged in');
      }

      // Step 1: 상품 정보 확인
      setTxSteps((prev) =>
        prev.map((s) =>
          s.id === 'verify'
            ? { ...s, status: 'complete' }
            : s.id === 'burn'
            ? { ...s, status: 'active' }
            : s,
        ),
      );

      if (isBorrow) {
        // Borrow offer 취소 - 컨트랙트 호출
        // ETH 잔액 확인 및 전송 (트랜잭션 실행 전 필수)
        const userAddress = getCustodyWalletAddress(user.id);
        if (!userAddress) {
          throw new Error('No custody wallet found');
        }
        await ensureEthBalance(userAddress);

        // Step 2: Burn 완료 (시뮬레이션)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'burn'
              ? { ...s, status: 'complete' }
              : s.id === 'legacy_read'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Burn 완료 후 담보 주식 반환
        if (stock) {
          updateUserStocks(stock.symbol, borrowOffer.collateralAmount);
        }

        // Step 3: 레거시 시스템 이벤트 수신 (시뮬레이션)
        const legacyDelay = Math.floor(Math.random() * 3000) + 2000; // 2000~5000ms
        await new Promise((resolve) => setTimeout(resolve, legacyDelay));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'legacy_read'
              ? { ...s, status: 'complete' }
              : s.id === 'pledge_release'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 4: 질권 해제 (시뮬레이션)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'pledge_release'
              ? { ...s, status: 'complete' }
              : s.id === 'stock_transfer'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 5: 담보 주식 유저에게 전달 (시뮬레이션) 및 cancelBorrowOffer
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const offerId =
          'onChainId' in borrowOffer && typeof borrowOffer.onChainId === 'bigint'
            ? borrowOffer.onChainId
            : BigInt(borrowOffer.id);
        const hash = await cancelBorrowOfferContract(offerId, user.id);
        setTxHash(hash);
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'stock_transfer'
              ? { ...s, status: 'complete' }
              : s.id === 'tx'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 6: 정산 완료
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        // ETH 잔액 확인 및 전송 (트랜잭션 실행 전 필수)
        const userAddress = getCustodyWalletAddress(user.id);
        if (!userAddress) {
          throw new Error('No custody wallet found');
        }
        await ensureEthBalance(userAddress);

        // Lend offer 취소 - 컨트랙트 호출
        const hash = await cancelLendOfferContract(BigInt(lendOffer.id), user.id);
        setTxHash(hash);

        // Step 2: Burn 완료
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'burn'
              ? { ...s, status: 'complete' }
              : s.id === 'bond_close'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Burn 완료 후 대여 원화 반환
        updateUserCash(lendOffer.loanAmount);

        // Step 3: 채권 종료
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'bond_close'
              ? { ...s, status: 'complete' }
              : s.id === 'cash_transfer'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 4: 원화 전달
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'cash_transfer'
              ? { ...s, status: 'complete' }
              : s.id === 'tx'
              ? { ...s, status: 'active' }
              : s,
          ),
        );

        // Step 5: 정산 완료
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      setTxSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));
      setIsComplete(true);
    } catch (error) {
      console.error('Cancel offer failed:', error);
      setTxError(error instanceof Error ? error.message : '상품 취소 실패');
      setTxSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' as const } : s)),
      );
    }
  };

  const handleClose = () => {
    setShowTx(false);
    setTxSteps([]);
    setTxHash('');
    setIsComplete(false);
    cachedOfferRef.current = null;
    onClose();
  };

  if (showTx) {
    return (
      <TransactionModal
        open={showTx}
        onClose={handleClose}
        title={isBorrow ? '대출 상품 취소 중' : '대여 상품 취소 중'}
        steps={txSteps}
        txHash={txHash}
        isComplete={isComplete}
        error={txError}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {isBorrow ? '대출 상품 취소' : '대여 상품 취소'}
          </DialogTitle>
          <DialogDescription>
            {isBorrow
              ? '정말로 이 대출 상품을 취소하시겠습니까?'
              : '정말로 이 대여 상품을 취소하시겠습니까?'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 상품 정보 요약 */}
          <div className="rounded-lg bg-secondary p-4">
            <h4 className="mb-3 text-sm font-medium">취소할 상품 정보</h4>
            <div className="space-y-2 text-sm">
              {isBorrow ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">담보</span>
                    <span className="font-medium">
                      {borrowOffer.collateralAmount.toLocaleString()}주 {stock?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">대출 희망 금액</span>
                    <span className="font-medium">₩{borrowOffer.loanAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">이자율</span>
                    <span className="font-medium">{borrowOffer.interestRate}%</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">대여 금액</span>
                    <span className="font-medium">₩{lendOffer.loanAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">이자율</span>
                    <span className="font-medium">{lendOffer.interestRate}%</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 취소 시 진행 과정 안내 */}
          <div className="rounded-lg border border-border p-4">
            <h4 className="mb-3 text-sm font-medium">취소 시 진행 과정</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              {isBorrow ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      1
                    </div>
                    <span>상품 정보 확인</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      2
                    </div>
                    <span>담보토큰 Burn</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      3
                    </div>
                    <span>레거시 시스템 이벤트 수신</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      4
                    </div>
                    <span>질권 해제</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      5
                    </div>
                    <span>담보 주식 유저에게 전달</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      6
                    </div>
                    <span>정산 완료</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      1
                    </div>
                    <span>상품 정보 확인</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      2
                    </div>
                    <span>대여토큰(dKRW) Burn</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      3
                    </div>
                    <span>채권 종료</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      4
                    </div>
                    <span>원화 유저에게 전달</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs">
                      5
                    </div>
                    <span>정산 완료</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 경고 메시지 */}
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>취소 후에는 되돌릴 수 없습니다.</span>
          </div>

          {/* 버튼 */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 bg-transparent" onClick={onClose}>
              돌아가기
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleCancel}>
              취소하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
