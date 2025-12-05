"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { type UIBorrowOffer, type UILendOffer, useOraclePricesWagmi, useAllowedCollateralTokensWagmi } from "@/lib/hooks"
import { mapCollateralTokens } from "@/lib/contracts/config"
import { Clock, Percent, ArrowRight } from "lucide-react"
import { TokenIcon } from "@/components/token-icon"

// 종목군 ID를 문자로 변환 (1 -> A, 2 -> B, 3 -> C, ...)
function categoryIdToLetter(categoryId: bigint | undefined | null): string {
  if (categoryId === undefined || categoryId === null) {
    return 'N/A';
  }
  const num = Number(categoryId);
  if (num <= 0) return 'N/A';
  // 1 -> A, 2 -> B, 3 -> C, ...
  return String.fromCharCode(64 + num); // 65는 'A'의 ASCII 코드
}

interface OfferCardProps {
  offer: UIBorrowOffer | UILendOffer
  type: "borrow" | "lend"
  onMatch?: () => void
  onEdit?: () => void
  onCancel?: () => void
  showActions?: boolean
  isOwner?: boolean
}

export function OfferCard({
  offer,
  type,
  onMatch,
  onEdit,
  onCancel,
  showActions = true,
  isOwner = false,
}: OfferCardProps) {
  const { prices: oraclePrice } = useOraclePricesWagmi()
  const { tokens: collateralTokenAddresses } = useAllowedCollateralTokensWagmi()
  
  // 온체인에서 가져온 토큰 목록
  const collateralTokens = mapCollateralTokens(collateralTokenAddresses)

  const isBorrow = type === "borrow"
  const borrowOffer = offer as UIBorrowOffer
  const lendOffer = offer as UILendOffer

  // 담보 토큰 정보 가져오기 - 온체인 데이터 사용
  const collateralSymbol = isBorrow ? borrowOffer.collateralStock : lendOffer.requestedCollateralStock
  const collateralToken = collateralTokens.find((t) => t.symbol === collateralSymbol)

  const stockPrice = oraclePrice[collateralSymbol] || 0
  const collateralValue = isBorrow ? borrowOffer.collateralAmount * stockPrice : 0
  const ltv = isBorrow && collateralValue > 0 ? (borrowOffer.loanAmount / collateralValue) * 100 : 0

  return (
    <Card className="overflow-hidden transition-all hover:border-primary/50">
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                isBorrow ? "bg-orange-500/20 text-orange-500" : "bg-primary/20 text-primary"
              }`}
            >
              {collateralToken?.icon ? (
                <TokenIcon icon={collateralToken.icon} name={collateralToken.name} size={24} />
              ) : (
                <span className="text-lg">{isBorrow ? "📉" : "📈"}</span>
              )}
            </div>
            <div>
              <p className="font-medium">{isBorrow ? "담보 대출" : "자금 대여"}</p>
              <p className="text-xs text-muted-foreground">{new Date(offer.createdAt).toLocaleDateString("ko-KR")}</p>
            </div>
          </div>
          <Badge variant={offer.status === "active" ? "default" : "secondary"}>
            {offer.status === "active" ? "Active" : offer.status === "matched" ? "Matched" : offer.status}
          </Badge>
        </div>

        <div className="mb-4 space-y-3">
          {isBorrow ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">담보</span>
                <span className="font-mono font-medium">
                  {borrowOffer.collateralAmount.toLocaleString()} {collateralToken?.name || collateralSymbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">담보 가치</span>
                <span className="font-mono">₩{collateralValue.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">대출 희망</span>
                <span className="font-mono font-medium text-primary">{borrowOffer.loanAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">대출 희망 토큰</span>
                <span className="font-mono font-medium">{borrowOffer.loanCurrency}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">LTV</span>
                <span className={`font-mono ${ltv > 60 ? "text-yellow-500" : "text-primary"}`}>{ltv.toFixed(1)}%</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">대여 금액</span>
                <span className="font-mono font-medium text-primary">{lendOffer.loanAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">대여 토큰</span>
                <span className="font-mono font-medium">{lendOffer.loanCurrency}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">허용 담보 종목군</span>
                <span className="font-mono font-medium">
                  {categoryIdToLetter(lendOffer.categoryId)}군
                </span>
              </div>
            </>
          )}
        </div>

        <div className="mb-4 flex items-center gap-4 rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-1.5">
            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{offer.interestRate}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm">{offer.maturityDays}일</span>
          </div>
        </div>

        {showActions && offer.status === "active" && (
          <div className="flex gap-2">
            {isOwner ? (
              <>
                <Button variant="outline" size="sm" className="flex-1 bg-transparent" onClick={onEdit}>
                  수정
                </Button>
                <Button variant="destructive" size="sm" className="flex-1" onClick={onCancel}>
                  취소
                </Button>
              </>
            ) : (
              <Button size="sm" className="w-full gap-2" onClick={onMatch}>
                {isBorrow ? "대여하기" : "대출받기"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
