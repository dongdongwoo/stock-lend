"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, ExternalLink, FileText, Coins, Send, XCircle } from "lucide-react"

export type TxStep = {
  id: string
  label: string
  status: "pending" | "active" | "complete" | "error"
}

interface TransactionModalProps {
  open: boolean
  onClose: () => void
  title: string
  steps: TxStep[]
  txHash?: string
  isComplete: boolean
  error?: string | null
}

export function TransactionModal({ open, onClose, title, steps, txHash, isComplete, error }: TransactionModalProps) {
  const explorerUrl = txHash ? `https://sepolia-explorer.giwa.io/tx/${txHash}` : null

  const getIcon = (stepId: string) => {
    switch (stepId) {
      case "legacy":
        return FileText
      case "token":
        return Coins
      case "tx":
        return Send
      default:
        return FileText
    }
  }

  // 트랜잭션 진행 중일 때는 모달 닫기 방지
  const handleOpenChange = (newOpen: boolean) => {
    // 트랜잭션이 완료되었거나 에러가 발생한 경우에만 닫기 허용
    if (!newOpen && (isComplete || error)) {
      onClose();
    }
    // 진행 중일 때는 닫기 무시
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md max-h-[90vh] flex flex-col"
        showCloseButton={isComplete || !!error}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          {steps.map((step) => {
            const Icon = getIcon(step.id)

            return (
              <div key={step.id} className="flex items-center gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                    step.status === "complete"
                      ? "border-primary bg-primary text-primary-foreground"
                      : step.status === "active"
                        ? "border-primary text-primary"
                        : step.status === "error"
                          ? "border-destructive text-destructive"
                          : "border-border text-muted-foreground"
                  }`}
                >
                  {step.status === "complete" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : step.status === "active" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`font-medium ${step.status === "pending" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    {step.label}
                  </p>
                  {step.status === "active" && <p className="text-sm text-muted-foreground">처리 중...</p>}
                </div>
              </div>
            )
          })}
        </div>

        {(error || isComplete) && (
          <div className="space-y-4 mt-4 flex-shrink-0">
            {error && (
              <>
                <div className="rounded-lg bg-destructive/10 p-4 text-center">
                  <XCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
                  <p className="font-medium text-destructive">트랜잭션 실패</p>
                  <p className="mt-1 text-sm text-muted-foreground break-all">{error}</p>
                </div>

                <Button onClick={onClose} className="w-full">
                  닫기
                </Button>
              </>
            )}

            {isComplete && !error && (
              <>
                <div className="rounded-lg bg-primary/10 p-4 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary" />
                  <p className="font-medium text-primary">트랜잭션 완료!</p>
                </div>

                {explorerUrl && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 bg-transparent"
                    onClick={() => window.open(explorerUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Explorer에서 확인
                  </Button>
                )}

                <Button onClick={onClose} className="w-full">
                  닫기
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
