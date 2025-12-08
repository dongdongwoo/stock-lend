'use client';

import { Github, Mail, Twitter, X } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
            <p className="text-sm text-muted-foreground">
              © {currentYear} StockLend. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  alert('미구현 기능입니다.');
                }}
                className="transition-colors hover:text-foreground"
              >
                이용약관
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  alert('미구현 기능입니다.');
                }}
                className="transition-colors hover:text-foreground"
              >
                개인정보처리방침
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={(e) => {
                e.preventDefault();
                alert('미구현 기능입니다.');
              }}
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">support@stocklend.io</span>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                alert('미구현 기능입니다.');
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="X"
            >
              <Twitter className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                alert('미구현 기능입니다.');
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
