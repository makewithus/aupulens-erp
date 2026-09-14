"use client";

import { ReactNode, useState, useRef, useEffect } from "react";
import { PlatformHeader } from "./PlatformHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { cn } from "@/lib/utils";
import Lenis from "lenis";
import { platformSidebarConfig } from "@/config/sidebar/platform";
import { usePageActionsStore } from "@/store/pageActionsStore";

interface PlatformDashboardLayoutProps {
  children: ReactNode;
  companyName?: string;
  dashboardTitle?: string;
  pageName?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSignOut: () => void;
  onRefresh?: () => void | Promise<void>;
  className?: string;
  profilePath?: string;
}

export function PlatformDashboardLayout({
  children,
  companyName,
  dashboardTitle,
  pageName,
  userName,
  userEmail,
  userRole,
  onSignOut,
  onRefresh,
  className,
  profilePath,
}: PlatformDashboardLayoutProps) {
  const registeredOnRefresh = usePageActionsStore((s) => s.onRefresh);
  const effectiveOnRefresh = onRefresh || registeredOnRefresh || undefined;

  const [isMainScrolling, setIsMainScrolling] = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mainScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (!mainScrollRef.current || !contentRef.current) return;

    const lenis = new Lenis({
      wrapper: mainScrollRef.current,
      content: contentRef.current,
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

  useEffect(() => {
    const handleMainScroll = () => {
      setIsMainScrolling(true);

      if (mainScrollTimeoutRef.current) {
        clearTimeout(mainScrollTimeoutRef.current);
      }

      mainScrollTimeoutRef.current = setTimeout(() => {
        setIsMainScrolling(false);
      }, 1000);
    };

    const mainScroll = mainScrollRef.current;
    if (mainScroll) {
      mainScroll.addEventListener("scroll", handleMainScroll);
    }

    return () => {
      if (mainScroll) {
        mainScroll.removeEventListener("scroll", handleMainScroll);
      }
      if (mainScrollTimeoutRef.current) {
        clearTimeout(mainScrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col">
      <PlatformHeader
        companyName={companyName}
        dashboardTitle={dashboardTitle}
        pageName={pageName}
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        onSignOut={onSignOut}
        onRefresh={effectiveOnRefresh}
        profilePath={profilePath}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <DashboardSidebar
          sections={platformSidebarConfig}
          isCollapsed={!isSidebarOpen}
          onToggleCollapse={() => setIsSidebarOpen(!isSidebarOpen)}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main
          ref={mainScrollRef}
          className={cn(
            "flex-1 overflow-y-auto youtube-scrollbar bg-linear-to-br from-background via-background to-muted/10",
            isMainScrolling && "is-scrolling",
            className,
          )}
        >
          <div
            ref={contentRef}
            className="p-3 sm:p-4 md:p-6 lg:p-8"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
