"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  PersistentDashboardContext,
  type PersistentDashboardDetails,
} from "@/components/dashboard/PersistentDashboardContext";
import { SalesRouteDataPrefetcher } from "@/components/sales/SalesRouteDataPrefetcher";
import { salesSidebarConfig } from "@/config/sidebar/sales";

// Same persistent-shell pattern as app/finance/layout.tsx: the sidebar/header mount once, and each
// page's own <DashboardLayout> only reports its title/breadcrumbs. userRole is deliberately not
// passed so sidebar filtering and the plan badge behave exactly as they did per-page.
function pageDetails(pathname: string, user?: { name?: string | null; email?: string | null }): PersistentDashboardDetails {
  const routeItem = salesSidebarConfig.flatMap((s) => s.items).find((item) => item.href === pathname);
  const tail = pathname.split("/").filter(Boolean).at(-1) || "dashboard";
  const pageName = routeItem?.title || tail.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return {
    sidebarSections: salesSidebarConfig,
    companyName: "Aupulens",
    dashboardTitle: "Sales",
    pageName,
    breadcrumbs: [{ label: "Sales", href: "/sales/summary" }, { label: pageName }],
    userName: user?.name || "",
    userEmail: user?.email || "",
  };
}

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const initialDetails = useMemo(() => pageDetails(pathname, user), [pathname, user?.name, user?.email]);
  const [registered, setRegistered] = useState({ pathname, details: initialDetails });
  const details = registered.pathname === pathname ? registered.details : initialDetails;
  const refreshRef = useRef<PersistentDashboardDetails["onRefresh"]>(undefined);

  const updateDetails = useCallback((next: PersistentDashboardDetails) => {
    setRegistered((previous) => {
      const current = previous.pathname === pathname ? previous.details : initialDetails;
      const unchanged = current.pageName === next.pageName
        && current.dashboardTitle === next.dashboardTitle
        && current.userName === next.userName
        && current.userEmail === next.userEmail
        && JSON.stringify(current.breadcrumbs) === JSON.stringify(next.breadcrumbs);
      return unchanged && previous.pathname === pathname
        ? previous
        : { pathname, details: unchanged ? current : { ...current, ...next } };
    });
  }, [initialDetails, pathname]);

  const context = useMemo(() => ({ update: updateDetails, refreshRef }), [updateDetails]);
  const signOutUser = useCallback(() => signOut({ callbackUrl: "/auth" }), []);
  const refreshPage = useCallback(() => refreshRef.current?.(), []);

  // Print views are standalone documents with no app chrome.
  if (pathname.includes("/print/")) return <>{children}</>;

  return (
    <PersistentDashboardContext.Provider value={context}>
      <SalesRouteDataPrefetcher />
      <DashboardLayout
        {...details}
        sidebarSections={salesSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Sales"
        pageName={details.pageName}
        userName={user?.name || details.userName || ""}
        userEmail={user?.email || details.userEmail || ""}
        profilePath="/sales/profile"
        onSignOut={signOutUser}
        onRefresh={refreshPage}
        persistentShell
      >
        {children}
      </DashboardLayout>
    </PersistentDashboardContext.Provider>
  );
}
