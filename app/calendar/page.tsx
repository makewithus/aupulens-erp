"use client";

import { CalendarDays } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import TaskCalendar from "@/components/crm/TaskCalendar";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
import { projectsSidebarConfig } from "@/config/sidebar/projects";
import { masterAdminSidebarConfig } from "@/config/sidebar/master-admin";

/**
 * Smart Enterprise Calendar (6.5) — one page unifying dates from across the ERP
 * (CRM tasks, HR leave/attendance, finance payments, payroll) with AI conflict
 * detection. Role-scoped server-side by /api/calendar. Linked from the Admin,
 * HR, and Sales sidebars — since it's genuinely cross-module, the sidebar shown
 * matches WHICH sidebar the user actually clicked it from (via a `?module=`
 * param each of those links carries), not just their account role — an admin-
 * level tester clicking it from HR's sidebar should still see HR's sidebar,
 * not always fall back to Admin's. Falls back to the session role when the
 * param is absent/unrecognised (e.g. someone bookmarks the bare URL).
 */
const ROLE_SIDEBAR: Record<string, { sidebar: any; dashboardTitle: string; authPath: string }> = {
  admin: { sidebar: adminSidebarConfig, dashboardTitle: "Admin", authPath: "/auth/admin" },
  "master-admin": { sidebar: masterAdminSidebarConfig, dashboardTitle: "Master Admin", authPath: "/auth/admin" },
  finance: { sidebar: financeSidebarConfig, dashboardTitle: "Finance", authPath: "/auth/finance" },
  hr: { sidebar: hrSidebarConfig, dashboardTitle: "HR", authPath: "/auth/hr" },
  sales: { sidebar: salesSidebarConfig, dashboardTitle: "Sales", authPath: "/auth/sales" },
  inventory: { sidebar: inventorySidebarConfig, dashboardTitle: "Inventory", authPath: "/auth/inventory" },
  manufacturing: { sidebar: manufacturingSidebarConfig, dashboardTitle: "Manufacturing", authPath: "/auth/manufacturing" },
  project: { sidebar: projectsSidebarConfig, dashboardTitle: "Projects", authPath: "/auth/admin" },
};

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  if (status === "loading") return <AuthSplash />;

  const moduleParam = searchParams.get("module") || "";
  const role = (session?.user as any)?.role || "admin";
  const cfg = ROLE_SIDEBAR[moduleParam] || ROLE_SIDEBAR[role] || ROLE_SIDEBAR.admin;

  return (
    <DashboardLayout
      sidebarSections={cfg.sidebar}
      dashboardTitle={cfg.dashboardTitle}
      pageName="Enterprise Calendar"
      breadcrumbs={[{ label: cfg.dashboardTitle }, { label: "Enterprise Calendar" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={role}
      onSignOut={() => signOut({ callbackUrl: cfg.authPath })}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" /> Enterprise Calendar
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everything with a date, in one place — with AI conflict detection.
        </p>
      </div>
      <TaskCalendar />
    </DashboardLayout>
  );
}
