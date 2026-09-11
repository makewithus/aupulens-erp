import { Building2, LayoutDashboard } from "lucide-react";

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
    items: [{ title: "Dashboard", href: "/platform", icon: LayoutDashboard }],
  },
  {
    title: "Organisations",
    items: [{ title: "Organisations", href: "/platform/organizations", icon: Building2 }],
  },
];
