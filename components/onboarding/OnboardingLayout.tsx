"use client";

import { ReactNode, useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { NetworkDiagram } from "./NetworkDiagram";
import Lenis from "lenis";

interface OnboardingLayoutProps {
  children: ReactNode;
  currentStep?: number;
}

export function OnboardingLayout({ children, currentStep }: OnboardingLayoutProps) {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      wheelMultiplier: 0.8,
      touchMultiplier: 1.2,
      smoothWheel: true,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between lg:flex-row lg:h-screen lg:overflow-hidden lg:justify-start">
      {/* Left Panel - Desktop only (50% width) */}
      <div className="hidden lg:flex lg:w-[50%] flex-col justify-between bg-zinc-50 dark:bg-zinc-950 border-r border-border relative overflow-hidden h-screen select-none">
        <div className="mx-auto flex w-full max-w-md flex-col px-8 pt-12 pb-16 lg:flex-1 lg:justify-between lg:py-16 z-10">
          {/* Logo at the top */}
          <div>
            <Logo
              width={135}
              height={40}
              className="h-10 w-auto select-none"
            />
          </div>

          {/* Center Visuals */}
          <div className="flex flex-1 flex-col justify-center gap-10 w-full">
            <div className="space-y-4">
              <h1 className="text-4xl xl:text-5xl font-black tracking-tighter leading-none text-foreground whitespace-pre-line">
                Create your{"\n"}organization.
              </h1>
            </div>
            <div className="w-full flex justify-start py-2">
              <NetworkDiagram />
            </div>
          </div>

          {/* Footer */}
          <div className="text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest">
            © {new Date().getFullYear()} AUPULENS ERP
          </div>
        </div>

        {/* Subtle Decorative Glow Backgrounds */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full filter blur-[100px] pointer-events-none translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full filter blur-[100px] pointer-events-none -translate-x-1/3 translate-y-1/3" />
      </div>

      {/* Right Panel - containing form content (50% width) */}
      <div className="flex-1 lg:flex-none lg:w-[50%] flex flex-col justify-between overflow-y-auto lg:h-screen">
        <div className="mx-auto flex w-full max-w-md flex-col px-8 pt-12 pb-16 min-h-screen lg:min-h-0 lg:flex-1 lg:justify-between lg:py-16">
          {/* Top Bar */}
          <div className="flex items-center justify-between w-full">
            <div className="lg:hidden">
              <Logo
                width={120}
                height={36}
                className="h-9 w-auto select-none"
              />
            </div>
            <h2 className="hidden lg:block text-2xl font-black tracking-tighter text-foreground leading-none">
              {currentStep === 1 && "Account Setup"}
              {currentStep === 2 && "Organization Info"}
              {currentStep === 3 && "Business Settings"}
            </h2>
            <ThemeToggle />
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col justify-center py-10 lg:py-6">
            <div className="space-y-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
