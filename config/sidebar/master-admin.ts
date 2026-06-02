import {
  LayoutDashboard,
  Users,
  Building2,
  Globe,
  Activity,
  Shield,
  Settings,
} from "lucide-react";
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
