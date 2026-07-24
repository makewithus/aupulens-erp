"use client";

import { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

interface AuthLayoutProps {
  hero?: ReactNode; // Kept as optional to avoid immediate type errors
  children: ReactNode;
}

export function AuthLayout({
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
  <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-8 pt-12 pb-16">

    {/* Top Bar */}
    <div className="flex items-center justify-between">
      <Logo
        width={140}
        height={36}
        className="h-9 w-auto select-none"
      />

      <ThemeToggle />
    </div>

    {/* Content */}
    <div className="flex flex-1 flex-col justify-center">
      <div className="space-y-14">
        {children}
      </div>
    </div>

  </div>
</div>
  );
}
