"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  PersistentDashboardContext,
  type PersistentDashboardDetails,
} from "@/components/dashboard/PersistentDashboardContext";

interface Props {
  children: ReactNode;
  sidebarSections: any[];
  /** e.g. "Sales" — shown as the dashboard title and first breadcrumb. */
  moduleLabel: string;
  /** Breadcrumb target for the module label. */
  rootHref: string;
  profilePath: string;
  /** When set, passed as userRole (session role first). Omit to keep the per-page default of no role. */
  fallbackRole?: string;
  /** Routes containing this string render bare (print views have no app chrome). */
  bareWhenPathIncludes?: string;
  /** Mounted once alongside the shell (e.g. a hover data prefetcher). */
  extras?: ReactNode;
}

/**
 * Mounts the sidebar/header ONCE per module so page changes only swap the content area.
 * Each page's own <DashboardLayout> turns into a details reporter via PersistentDashboardContext.
 */
export function PersistentModuleShell({
  children, sidebarSections, moduleLabel, rootHref, profilePath, fallbackRole, bareWhenPathIncludes, extras,
}: Props) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const role = fallbackRole ? user?.role || fallbackRole : undefined;

  const initialDetails = useMemo<PersistentDashboardDetails>(() => {
    const routeItem = sidebarSections.flatMap((s) => s.items).find((item: any) => item.href === pathname);
    const tail = pathname.split("/").filter(Boolean).at(-1) || moduleLabel;
    const pageName = routeItem?.title || tail.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return {
      sidebarSections, companyName: "Aupulens", dashboardTitle: moduleLabel, pageName,
      breadcrumbs: [{ label: moduleLabel, href: rootHref }, { label: pageName }],
      userName: user?.name || "", userEmail: user?.email || "", userRole: role, profilePath,
    };
  }, [pathname, sidebarSections, moduleLabel, rootHref, profilePath, user?.name, user?.email, role]);

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

  if (bareWhenPathIncludes && pathname.includes(bareWhenPathIncludes)) return <>{children}</>;

  return (
    <PersistentDashboardContext.Provider value={context}>
      {extras}
      <DashboardLayout
        {...details}
        sidebarSections={sidebarSections}
        companyName="Aupulens"
        dashboardTitle={moduleLabel}
        pageName={details.pageName}
        userName={user?.name || details.userName || ""}
        userEmail={user?.email || details.userEmail || ""}
        userRole={role ?? details.userRole}
        profilePath={profilePath}
        onSignOut={signOutUser}
        onRefresh={refreshPage}
        persistentShell
      >
        {children}
      </DashboardLayout>
    </PersistentDashboardContext.Provider>
  );
}
