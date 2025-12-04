"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStore } from "@/lib/store"
import { COLLATERAL_TOKENS } from "@/lib/contracts/config"
import {
  createCustodyWallet,
  loadCustodyWallet,
  saveCustodyWallet,
  fundCustodyWallet,
  ensureEthBalance,
} from "@/lib/wallet/custody"
import { Loader2, CheckCircle2, Wallet, Link, Shield } from "lucide-react"

interface LoginModalProps {
  open: boolean
  onClose: () => void
}

type LoginStep = "input" | "connecting" | "wallet" | "complete"

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { setUser, setConnecting } = useStore()
  const [step, setStep] = useState<LoginStep>("input")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const handleLogin = async () => {
    if (!username || !password) return

    setStep("connecting")
    setConnecting(true)

    try {
      // Simulate legacy connection (3 seconds)
      await new Promise((resolve) => setTimeout(resolve, 3000))

      setStep("wallet")

      // 유저 ID 생성
      const userId = Math.random().toString(36).substring(7)

      // 커스터디 월렛 로드 또는 생성
      let custodyWallet = loadCustodyWallet(userId)
      let isNewWallet = false

      if (!custodyWallet) {
        // 새 월렛 생성
        custodyWallet = createCustodyWallet()
        saveCustodyWallet(userId, custodyWallet)
        isNewWallet = true
      }

      // Simulate wallet creation (2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // ETH 잔액 확인 및 전송 (신규 월렛이거나 잔액이 부족한 경우)
      if (isNewWallet) {
        // 신규 월렛: 초기 ETH 전송
        await fundCustodyWallet(custodyWallet.address)
      } else {
        // 기존 월렛: 최소 잔액 확인 및 전송
        await ensureEthBalance(custodyWallet.address)
      }

      const stocks: { [key: string]: number } = {}
      COLLATERAL_TOKENS.forEach((token) => {
        stocks[token.symbol] = 100 // 각 주식 100주씩 보유
      })

      setUser({
        id: userId,
        username,
        wallet: custodyWallet.address, // 커스터디 월렛 주소 사용
        cash: 10000000, // 1천만원 보유
        stocks,
      })

      setStep("complete")
      setConnecting(false)

      // Auto close after success
      setTimeout(() => {
        onClose()
        setStep("input")
        setUsername("")
        setPassword("")
      }, 2000)
    } catch (error) {
      console.error("Login failed:", error)
      setConnecting(false)
      setStep("input")
      // TODO: 에러 메시지 표시
    }
  }

  const steps = [
    { id: "connecting", label: "레거시 시스템 연결", icon: Link },
    { id: "wallet", label: "지갑 생성", icon: Wallet },
    { id: "complete", label: "완료", icon: CheckCircle2 },
  ]

  const getStepStatus = (stepId: string) => {
    const order = ["connecting", "wallet", "complete"]
    const currentIndex = order.indexOf(step)
    const stepIndex = order.indexOf(stepId)

    if (stepIndex < currentIndex) return "complete"
    if (stepIndex === currentIndex) return "active"
    return "pending"
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            계정 연결
          </DialogTitle>
        </DialogHeader>

        {step === "input" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">아이디</Label>
              <Input
                id="username"
                placeholder="사용자 ID 입력"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="비밀번호 입력"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button onClick={handleLogin} className="w-full" disabled={!username || !password}>
              연결하기
            </Button>
            <p className="text-center text-xs text-muted-foreground">로그인 시 자동으로 지갑이 생성됩니다</p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              {steps.map((s, index) => {
                const status = getStepStatus(s.id)
                const Icon = s.icon

                return (
                  <div key={s.id} className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                        status === "complete"
                          ? "border-primary bg-primary text-primary-foreground"
                          : status === "active"
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {status === "complete" ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : status === "active" ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p
                        className={`font-medium ${status === "pending" ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {s.label}
                      </p>
                      {status === "active" && <p className="text-sm text-muted-foreground">처리 중...</p>}
                    </div>
                    {index < steps.length - 1 && <div className="absolute left-9 h-6 w-0.5 translate-y-10 bg-border" />}
                  </div>
                )
              })}
            </div>

            {step === "complete" && (
              <div className="rounded-lg bg-primary/10 p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary" />
                <p className="font-medium text-primary">연결 완료!</p>
                <p className="text-sm text-muted-foreground">지갑이 성공적으로 생성되었습니다</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
