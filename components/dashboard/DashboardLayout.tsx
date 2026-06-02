"use client";

import { ReactNode, useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { DashboardHeader, BreadcrumbItem } from "./DashboardHeader";
// Sidebar removed - all navigation moved to Header
import { cn } from "@/lib/utils";
import DashboardFooter from "./DashboardFooter";
import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore, clearAllStores } from "@/store/authStore";

interface DashboardLayoutProps {
  children: ReactNode;
  // sidebarSections and sidebarConfig (legacy) kept so header can still receive the items
  sidebarSections?: any[];
  sidebarConfig?: any[]; // Alias for backwards compatibility
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
  profileHref?: string; // Alias for backwards compatibility
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
  // Support both prop names for backwards compatibility
  const sections = sidebarSections || sidebarConfig || [];
  const profile = profilePath || profileHref;

  // Mobile sidebar removed - all nav is in header

  // YouTube-style scrollbar for main content
  const [isMainScrolling, setIsMainScrolling] = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const mainScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          // 1. Clear local state synchronously
          clearAllStores();

          // 2. Native NextAuth Sign Out - await to ensure completion
          console.log("[DashboardLayout] Invoking native signOut...");
          await signOut({ callbackUrl: "/auth/admin", redirect: true });
        }}
        onRefresh={onRefresh}
        profilePath={profile}
        sidebarConfig={sections}
      />

      <div className="flex flex-1 overflow-hidden flex-col">
        {/* Sidebar removed - header contains the nav
            We still keep the `sections` variable and pass it to Header so the header can render nav items
        */}

        <main
          ref={mainScrollRef}
          className={cn(
            "flex-1 overflow-y-auto youtube-scrollbar bg-linear-to-br from-background via-background to-muted/10",
            isMainScrolling && "is-scrolling",
            className,
          )}
        >
          <div className="p-3 sm:p-4 md:p-6 lg:p-8">{children}</div>
        </main>

        {/* Footer - non-scrolling, anchored at the bottom
        <DashboardFooter /> */}
      </div>
    </div>
  );
}
