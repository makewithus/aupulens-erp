"use client";

import { ReactNode, useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { DashboardHeader, BreadcrumbItem } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import { AiSidebar } from "./AiSidebar";
import { cn } from "@/lib/utils";
import { clearAllStores } from "@/store/authStore";
import { useAiChatStore } from "@/store/aiChatStore";
import { usePageActionsStore } from "@/store/pageActionsStore";
import Lenis from "lenis";

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
          clearAllStores();
          console.log("[DashboardLayout] Invoking native signOut...");
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