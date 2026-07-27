"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Compass, LogOut, User } from "lucide-react";

export function SiteHeader() {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link href="/" className="space-y-0.5">
        <p className="text-lg font-semibold tracking-wide text-charcoal">
          HearHere
        </p>
        <p className="text-xs text-muted">在这里听见你的需求</p>
      </Link>
      <nav className="flex items-center gap-2">
        {session?.user ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden sm:inline-flex"
            >
              <Link href="/trips">
                <Compass className="mr-1 h-4 w-4" />
                我的攻略
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-sm text-muted sm:inline"
            >
              <User className="mr-1 h-4 w-4" />
              {session.user.name}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              title="退出"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">登录</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">注册</Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
