"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  PersistentDashboardContext,
  type PersistentDashboardDetails,
} from "@/components/dashboard/PersistentDashboardContext";
import { financeSidebarConfig } from "@/config/sidebar/finance";

function pageDetails(pathname: string, user?: { name?: string | null; email?: string | null; role?: string | null }): PersistentDashboardDetails {
  const routeItem = financeSidebarConfig
    .flatMap((section) => section.items)
    .find((item) => item.href === pathname);
  const tail = pathname.split("/").filter(Boolean).at(-1) || "summary";
  const pageName = routeItem?.title || tail.split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    sidebarSections: financeSidebarConfig,
    companyName: "Aupulens",
    dashboardTitle: "Finance",
    pageName,
    breadcrumbs: [{ label: "Finance", href: "/finance/summary" }, { label: pageName }],
    userName: user?.name || "",
    userEmail: user?.email || "",
    userRole: user?.role || undefined,
    profilePath: "/finance/profile",
  };
}

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const initialDetails = useMemo(
    () => pageDetails(pathname, user),
    [pathname, user?.name, user?.email, user?.role],
  );
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
        && current.userRole === next.userRole
        && JSON.stringify(current.breadcrumbs) === JSON.stringify(next.breadcrumbs);
      return unchanged && previous.pathname === pathname
        ? previous
        : { pathname, details: unchanged ? current : { ...current, ...next } };
    });
  }, [initialDetails, pathname]);

  const context = useMemo(() => ({ update: updateDetails, refreshRef }), [updateDetails]);
  const signOutUser = useCallback(() => signOut({ callbackUrl: "/auth" }), []);
  const refreshPage = useCallback(() => refreshRef.current?.(), []);

  return (
    <PersistentDashboardContext.Provider value={context}>
      <DashboardLayout
        {...details}
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance"
        pageName={details.pageName}
        userName={user?.name || details.userName || ""}
        userEmail={user?.email || details.userEmail || ""}
        userRole={user?.role || details.userRole}
        profilePath="/finance/profile"
        onSignOut={signOutUser}
        onRefresh={refreshPage}
        persistentShell
      >
        {children}
      </DashboardLayout>
    </PersistentDashboardContext.Provider>
  );
}
