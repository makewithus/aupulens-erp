import { LayoutDashboard } from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const masterAdminSidebarConfig: SidebarSection[] = [
  {
    title: "Dashboard",
    items: [
      {
        title: "Dashboard",
        href: "/master-admin",
        icon: LayoutDashboard,
      },
    ],
  },
];
