'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { LoginModal } from '@/components/login-modal';
import { clearCustodyWallet } from '@/lib/wallet/custody';
import { Trash2 } from 'lucide-react';
import {
  Wallet,
  Menu,
  X,
  LogOut,
  Copy,
  ExternalLink,
  Users,
  UserIcon,
  UserPlus,
} from 'lucide-react';

const navItems = [
  { href: '/', label: '대여' },
  { href: '/borrow', label: '대출' },
  { href: '/portfolio', label: '포트폴리오' },
];

export function Header() {
  const pathname = usePathname();
  const {
    user,
    allUsers,
    logout,
    switchUser,
    saveCurrentUser,
    createTestAccount,
    clearAllTestAccounts,
    removeTestAccount,
    clearAllAccountsExceptPark,
  } = useStore();
  const [showLogin, setShowLogin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCreatingTestAccount, setIsCreatingTestAccount] = useState(false);
  const [accountSwitchOpen, setAccountSwitchOpen] = useState(false);

  const formatWallet = (wallet: string) => {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  const copyWallet = () => {
    if (user?.wallet) {
      navigator.clipboard.writeText(user.wallet);
    }
  };

  const openExplorer = () => {
    if (user?.wallet) {
      window.open(`https://sepolia-explorer.giwa.io/address/${user.wallet}`, '_blank');
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    saveCurrentUser();
    await switchUser(accountId);
  };

  // 내 계정과 테스트 계정 구분
  const myAccounts = Object.values(allUsers).filter((account) => !account.id.startsWith('test_'));
  const testAccounts = Object.values(allUsers).filter((account) => account.id.startsWith('test_'));

  const handleCreateTestAccount = async () => {
    setIsCreatingTestAccount(true);
    try {
      saveCurrentUser();
      await createTestAccount();
    } catch (error) {
      console.error('Failed to create test account:', error);
    } finally {
      setIsCreatingTestAccount(false);
    }
  };

  const handleClearAllTestAccounts = () => {
    if (confirm('모든 테스트 계정을 삭제하시겠습니까?')) {
      saveCurrentUser();
      clearAllTestAccounts();
    }
  };

  const handleRemoveTestAccount = (userId: string, username: string) => {
    if (confirm(`테스트 계정 "${username}"을(를) 삭제하시겠습니까?`)) {
      saveCurrentUser();
      removeTestAccount(userId);
    }
  };

  const handleClearAllAccountsExceptPark = () => {
    if (confirm('박동우 계정을 제외한 모든 내 계정을 삭제하시겠습니까?')) {
      saveCurrentUser();
      clearAllAccountsExceptPark();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3">
              {/* 한화 로고 */}
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 28 28"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-primary-foreground"
                >
                  {/* 한화 로고 스타일 - H 문자 형태 */}
                  <path
                    d="M8 6V22M8 14H20M20 6V22"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-primary">StockLend</span>
                <span className="text-xs font-medium text-primary/80">한화투자증권</span>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    pathname === item.href
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-secondary">
                    <div className="hidden flex-col items-end text-sm md:flex">
                      <span className="font-medium">{user.username}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatWallet(user.wallet)}
                      </span>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                      <Wallet className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-1rem)]">
                  <div className="px-2 py-2">
                    <p className="text-sm font-medium">{user.username}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatWallet(user.wallet)}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={copyWallet} className="cursor-pointer">
                    <Copy className="mr-2 h-4 w-4" />
                    지갑 주소 복사
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={openExplorer} className="cursor-pointer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Explorer에서 보기
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* 데스크톱: 서브메뉴로 표시, 모바일: 인라인으로 표시 */}
                  <div className="md:hidden">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAccountSwitchOpen(!accountSwitchOpen);
                      }}
                      className="cursor-pointer"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      계정 전환
                    </DropdownMenuItem>
                    {accountSwitchOpen && (
                      <div className="max-h-80 overflow-y-auto border-t border-border">
                        {myAccounts.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                              내 계정
                            </div>
                            {myAccounts.map((account) => (
                              <DropdownMenuItem
                                key={account.id}
                                onSelect={() => {
                                  handleSwitchAccount(account.id);
                                  setAccountSwitchOpen(false);
                                }}
                                className={cn(
                                  'cursor-pointer',
                                  user.id === account.id && 'bg-secondary',
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <UserIcon className="h-4 w-4" />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{account.username}</span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {formatWallet(account.wallet)}
                                    </span>
                                  </div>
                                </div>
                              </DropdownMenuItem>
                            ))}
                            {myAccounts.length > 1 && (
                              <DropdownMenuItem
                                onSelect={() => {
                                  handleClearAllAccountsExceptPark();
                                  setAccountSwitchOpen(false);
                                }}
                                className="cursor-pointer text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                박동우 계정 제외한 모든 계정 삭제
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          테스트 계정
                        </div>
                        {testAccounts.length > 0 && (
                          <>
                            {testAccounts.map((account) => (
                              <DropdownMenuItem
                                key={account.id}
                                onSelect={() => {
                                  handleSwitchAccount(account.id);
                                  setAccountSwitchOpen(false);
                                }}
                                className={cn(
                                  'cursor-pointer',
                                  user.id === account.id && 'bg-secondary',
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <UserIcon className="h-4 w-4" />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{account.username}</span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {formatWallet(account.wallet)}
                                    </span>
                                  </div>
                                </div>
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          onSelect={async (e) => {
                            e.preventDefault();
                            await handleCreateTestAccount();
                            setAccountSwitchOpen(false);
                          }}
                          disabled={isCreatingTestAccount}
                          className="cursor-pointer"
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          {isCreatingTestAccount ? '테스트 계정 생성 중...' : '테스트 계정 생성'}
                        </DropdownMenuItem>
                        {testAccounts.length > 0 && (
                          <DropdownMenuItem
                            onSelect={() => {
                              handleClearAllTestAccounts();
                              setAccountSwitchOpen(false);
                            }}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            모든 테스트 계정 삭제
                          </DropdownMenuItem>
                        )}
                      </div>
                    )}
                  </div>
                  {/* 데스크톱: 서브메뉴 */}
                  <div className="hidden md:block">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <Users className="mr-2 h-4 w-4" />
                        계정 전환
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                        {myAccounts.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                              내 계정
                            </div>
                            {myAccounts.map((account) => (
                              <DropdownMenuItem
                                key={account.id}
                                onSelect={() => handleSwitchAccount(account.id)}
                                className={cn(
                                  'cursor-pointer',
                                  user.id === account.id && 'bg-secondary',
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <UserIcon className="h-4 w-4" />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{account.username}</span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {formatWallet(account.wallet)}
                                    </span>
                                  </div>
                                </div>
                              </DropdownMenuItem>
                            ))}
                            {myAccounts.length > 1 && (
                              <DropdownMenuItem
                                onSelect={handleClearAllAccountsExceptPark}
                                className="cursor-pointer text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                박동우 계정 제외한 모든 계정 삭제
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          테스트 계정
                        </div>
                        {testAccounts.length > 0 && (
                          <>
                            {testAccounts.map((account) => (
                              <div key={account.id} className="group relative">
                                <DropdownMenuItem
                                  onSelect={() => handleSwitchAccount(account.id)}
                                  className={cn(
                                    'cursor-pointer pr-8',
                                    user.id === account.id && 'bg-secondary',
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <UserIcon className="h-4 w-4" />
                                    <div className="flex flex-col">
                                      <span className="font-medium">{account.username}</span>
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {formatWallet(account.wallet)}
                                      </span>
                                    </div>
                                  </div>
                                </DropdownMenuItem>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveTestAccount(account.id, account.username);
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                              </div>
                            ))}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          onSelect={handleCreateTestAccount}
                          disabled={isCreatingTestAccount}
                          className="cursor-pointer"
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          {isCreatingTestAccount ? '테스트 계정 생성 중...' : '테스트 계정 생성'}
                        </DropdownMenuItem>
                        {testAccounts.length > 0 && (
                          <DropdownMenuItem
                            onSelect={handleClearAllTestAccounts}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            모든 테스트 계정 삭제
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      if (user) {
                        clearCustodyWallet(user.id); // 커스터디 월렛 삭제
                      }
                      logout();
                    }}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={() => setShowLogin(true)} className="gap-2">
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">계정 연결</span>
              </Button>
            )}

            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-border bg-background px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                    pathname === item.href
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {user && (
                <>
                  <div className="my-2 border-t border-border" />
                  {myAccounts.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                        내 계정
                      </div>
                      {myAccounts.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => {
                            handleSwitchAccount(account.id);
                            setMobileMenuOpen(false);
                          }}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-secondary/50',
                            user.id === account.id && 'bg-secondary',
                          )}
                        >
                          <UserIcon className="h-4 w-4" />
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{account.username}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {formatWallet(account.wallet)}
                            </span>
                          </div>
                        </button>
                      ))}
                      <div className="my-2 border-t border-border" />
                    </>
                  )}
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    테스트 계정
                  </div>
                  {testAccounts.length > 0 && (
                    <>
                      {testAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center gap-2 rounded-lg px-4 py-3 transition-colors hover:bg-secondary/50"
                        >
                          <button
                            onClick={() => {
                              handleSwitchAccount(account.id);
                              setMobileMenuOpen(false);
                            }}
                            className={cn(
                              'flex flex-1 items-center gap-3 text-sm',
                              user.id === account.id && 'bg-secondary',
                            )}
                          >
                            <UserIcon className="h-4 w-4" />
                            <div className="flex flex-col items-start">
                              <span className="font-medium">{account.username}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {formatWallet(account.wallet)}
                              </span>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              handleRemoveTestAccount(account.id, account.username);
                              setMobileMenuOpen(false);
                            }}
                            className="rounded-lg p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <div className="my-2 border-t border-border" />
                    </>
                  )}
                  <button
                    onClick={async () => {
                      await handleCreateTestAccount();
                      setMobileMenuOpen(false);
                    }}
                    disabled={isCreatingTestAccount}
                    className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/50 disabled:opacity-50"
                  >
                    <UserPlus className="h-4 w-4" />
                    {isCreatingTestAccount ? '테스트 계정 생성 중...' : '테스트 계정 생성'}
                  </button>
                  {testAccounts.length > 0 && (
                    <button
                      onClick={() => {
                        handleClearAllTestAccounts();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-secondary/50"
                    >
                      <Trash2 className="h-4 w-4" />
                      모든 테스트 계정 삭제
                    </button>
                  )}
                  <div className="my-2 border-t border-border" />
                  <button
                    onClick={() => {
                      if (user) {
                        clearCustodyWallet(user.id); // 커스터디 월렛 삭제
                      }
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-secondary/50"
                  >
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </button>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
}
