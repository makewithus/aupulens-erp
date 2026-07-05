"use client";

import { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

interface OnboardingLayoutProps {
  children: ReactNode;
}

export function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-8 pt-12 pb-16">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <Logo
            width={120}
            height={36}
            className="h-9 w-auto select-none"
          />
          <ThemeToggle />
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="space-y-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
