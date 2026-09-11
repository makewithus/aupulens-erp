import { Activity, Building2, CreditCard, KeyRound, LayoutDashboard, ScrollText, Search, Settings } from "lucide-react";

export interface PlatformSidebarItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface PlatformSidebarSection {
  title: string;
  items: PlatformSidebarItem[];
}

/**
 * Global Admin's own sidebar — a fully separate config from every
 * config/sidebar/<module>.ts file, which describe the tenant-facing app.
 * Phase 1 ships only the dashboard (the brief's "empty shell" exit gate);
 * each later phase adds its own section here as its UI ships, never
 * touching a tenant sidebar file.
 */
export const platformSidebarConfig: PlatformSidebarSection[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/platform", icon: LayoutDashboard },
      { title: "Search", href: "/platform/search", icon: Search },
    ],
  },
  {
    title: "Organisations",
    items: [{ title: "Organisations", href: "/platform/organizations", icon: Building2 }],
  },
  {
    title: "Billing",
    items: [{ title: "Plans", href: "/platform/plans", icon: CreditCard }],
  },
  {
    title: "Security",
    items: [
      { title: "Audit Logs", href: "/platform/audit-logs", icon: ScrollText },
      { title: "Retention", href: "/platform/settings/retention", icon: Settings },
      { title: "Access Requests", href: "/platform/access-requests", icon: KeyRound },
    ],
  },
  {
    title: "Operations",
    items: [{ title: "API Monitoring", href: "/platform/api-monitoring", icon: Activity }],
  },
];
