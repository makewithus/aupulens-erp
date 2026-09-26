"use client";

import { toast } from "sonner";
import { ReactNode, useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { DashboardHeader, BreadcrumbItem } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import { AiSidebar } from "./AiSidebar";
import { cn } from "@/lib/utils";
import { clearAllStores } from "@/store/authStore";
import { useAiChatStore } from "@/store/aiChatStore";
import { usePageActionsStore } from "@/store/pageActionsStore";

interface DashboardLayoutProps {
  children: ReactNode;
  sidebarSections?: any[];
  sidebarConfig?: any[]; 
  companyName?: string;
  dashboardTitle?: string;
  pageName?: string;
  breadcrumbs?: BreadcrumbItem[];
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSignOut?: () => void;
  onRefresh?: () => void | Promise<void>;
  className?: string;
  profilePath?: string;
  profileHref?: string; 
}

export function DashboardLayout({
  children,
  sidebarSections,
  sidebarConfig,
  companyName,
  dashboardTitle,
  pageName,
  breadcrumbs,
  userName,
  userEmail,
  userRole,
  onSignOut,
  onRefresh,
  className,
  profilePath,
  profileHref,
}: DashboardLayoutProps) {
  const sections = sidebarSections || sidebarConfig || [];
  const profile = profilePath || profileHref;
  // Pages that live under a shared module `layout.tsx` (this component
  // mounted once, not per-page) can't pass `onRefresh` as a prop — they
  // register it via usePageRefresh() instead. A directly-passed prop always
  // wins, so pages that still own their DashboardLayout call are unaffected.
  const registeredOnRefresh = usePageActionsStore((s) => s.onRefresh);
  const effectiveOnRefresh = onRefresh || registeredOnRefresh || undefined;

  const [isMainScrolling, setIsMainScrolling] = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mainScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  // AI panel open-state lives in a module-level store so it (and the chat inside)
  // survives client-side navigation instead of resetting on every page change.
  const isAiSidebarOpen = useAiChatStore((s) => s.isOpen);
  const toggleAiSidebar = useAiChatStore((s) => s.toggle);
  const closeAiSidebar = useAiChatStore((s) => s.close);

  useEffect(() => {
    if (!mainScrollRef.current || !contentRef.current) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const wrapper = mainScrollRef.current;
    const content = contentRef.current;
    let cancelled = false;
    let lenis: { raf: (time: number) => void; destroy: () => void } | null = null;
    let rafId = 0;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let running = false;

    const stopRafSoon = () => {
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
      }, 1600);
    };

    const startRaf = () => {
      if (!lenis || running) return;
      running = true;
      const raf = (time: number) => {
        if (!running || !lenis) return;
        lenis.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
      stopRafSoon();
    };

    const initializeLenis = async () => {
      const { default: Lenis } = await import("lenis");
      if (cancelled) return;
      lenis = new Lenis({
        wrapper,
        content,
        duration: 0.9,
        wheelMultiplier: 0.9,
        touchMultiplier: 1,
        smoothWheel: true,
      });
    };

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => void initializeLenis(), { timeout: 1500 });
    } else {
      fallbackTimer = setTimeout(() => void initializeLenis(), 250);
    }

    wrapper.addEventListener("wheel", startRaf, { passive: true });
    wrapper.addEventListener("touchstart", startRaf, { passive: true });
    wrapper.addEventListener("keydown", startRaf);

    return () => {
      cancelled = true;
      wrapper.removeEventListener("wheel", startRaf);
      wrapper.removeEventListener("touchstart", startRaf);
      wrapper.removeEventListener("keydown", startRaf);
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (stopTimer) clearTimeout(stopTimer);
      if (rafId) cancelAnimationFrame(rafId);
      lenis?.destroy();
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
    <div
      className="h-screen bg-background flex flex-col"
      // Expose the AI sidebar's width so viewport-fixed form action bars can
      // offset their right edge and not slide under the panel when it's open.
      style={{ ["--ai-sidebar-w" as string]: isAiSidebarOpen ? "450px" : "0px" }}
    >
      <DashboardHeader
        companyName={companyName}
        dashboardTitle={dashboardTitle}
        pageName={pageName}
        breadcrumbs={breadcrumbs}
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        onSignOut={async () => {
          console.log("[DashboardLayout] Sign out started, clearing state...");
          toast.success("Successfully signed out. Redirecting...");
          clearAllStores();
          console.log("[DashboardLayout] Invoking native signOut...");
          await new Promise((resolve) => setTimeout(resolve, 800)); // allow toast to be visible
          await signOut({ callbackUrl: "/auth", redirect: true });
        }}
        onRefresh={effectiveOnRefresh}
        profilePath={profile}
        sidebarConfig={sections}
        onToggleAi={toggleAiSidebar}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {sections.length > 0 && (
          <DashboardSidebar
            sections={sections}
            isCollapsed={!isSidebarOpen}
            onToggleCollapse={() => setIsSidebarOpen(!isSidebarOpen)}
            onClose={() => setIsSidebarOpen(false)}
          />
        )}

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

        {isAiSidebarOpen && <AiSidebar onClose={closeAiSidebar} />}
      </div>
    </div>
  );
}
