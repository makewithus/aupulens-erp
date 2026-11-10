"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AdminRouteDataPrefetcher } from "@/components/admin/AdminRouteDataPrefetcher";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import {
  PersistentDashboardContext,
  type PersistentDashboardDetails,
} from "@/components/dashboard/PersistentDashboardContext";

function pageLabel(pathname: string) {
  if (pathname.startsWith("/migration/")) return "Migration Center";
  if (pathname === "/migration") return "Data Migration Center";
  if (pathname === "/document-intelligence") return "Document Intelligence";
  const item = adminSidebarConfig.flatMap((section) => section.items).find((entry) => entry.href === pathname);
  if (item) return item.title;
  const tail = pathname.split("/").filter(Boolean).at(-1) || "Dashboard";
  return tail.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function isAdminPortalPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/")
    || pathname === "/migration" || pathname.startsWith("/migration/")
    || pathname === "/document-intelligence";
}

function breadcrumbsFor(pathname: string) {
  if (pathname.startsWith("/migration/")) {
    const id = pathname.split("/").at(-1) || "";
    return [
      { label: "Admin", href: "/admin/dashboard" },
      { label: "Migration Center", href: "/migration" },
      { label: `Batch ${id.slice(-6)}` },
    ];
  }
  return [
    { label: "Admin", href: "/admin/dashboard" },
    { label: pageLabel(pathname) },
  ];
}

export function AdminPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Keep the admin chrome mounted while navigating between admin pages and
  // adjacent tools that use the same navigation tree.
  const active = isAdminPortalPath(pathname);
  const user = session?.user;
  const initial = useMemo<PersistentDashboardDetails>(() => ({
    sidebarSections: adminSidebarConfig,
    companyName: "Aupulens",
    dashboardTitle: "Admin Dashboard",
    pageName: pageLabel(pathname),
    breadcrumbs: breadcrumbsFor(pathname),
    userName: user?.name || "",
    userEmail: user?.email || "",
    userRole: user?.role || "admin",
    profilePath: "/admin/profile",
  }), [pathname, user?.name, user?.email, user?.role]);
  const [registered, setRegistered] = useState({ pathname, details: initial });
  const details = registered.pathname === pathname ? registered.details : initial;
  const refreshRef = useRef<PersistentDashboardDetails["onRefresh"]>(undefined);

  const updateDetails = useCallback((next: PersistentDashboardDetails) => {
    setRegistered((previous) => {
      const current = previous.pathname === pathname ? previous.details : initial;
      const same = current.pageName === next.pageName
        && current.dashboardTitle === next.dashboardTitle
        && current.companyName === next.companyName
        && current.userName === next.userName
        && current.userEmail === next.userEmail
        && current.userRole === next.userRole
        && current.profilePath === next.profilePath
        && JSON.stringify(current.breadcrumbs) === JSON.stringify(next.breadcrumbs);
      return same && previous.pathname === pathname
        ? previous
        : { pathname, details: same ? current : { ...current, ...next } };
    });
  }, [initial, pathname]);

  const context = useMemo(() => ({ update: updateDetails, refreshRef }), [updateDetails]);
  const signOutUser = useCallback(() => signOut({ callbackUrl: "/auth" }), []);
  const refreshPage = useCallback(() => refreshRef.current?.(), []);

  if (!active) return <>{children}</>;

  return (
    <PersistentDashboardContext.Provider value={context}>
      <AdminRouteDataPrefetcher />
      <DashboardLayout
        {...details}
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle={details.dashboardTitle || "Admin Dashboard"}
        pageName={details.pageName || pageLabel(pathname)}
        userName={user?.name || details.userName || ""}
        userEmail={user?.email || details.userEmail || ""}
        userRole={user?.role || details.userRole || "admin"}
        profilePath="/admin/profile"
        onSignOut={signOutUser}
        onRefresh={refreshPage}
        persistentShell
      >
        {children}
      </DashboardLayout>
    </PersistentDashboardContext.Provider>
  );
}
