import { LayoutDashboard, FolderKanban } from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const projectsSidebarConfig: SidebarSection[] = [
  {
    title: "Projects",
    items: [
      {
        title: "All Projects",
        href: "/projects",
        icon: FolderKanban,
      },
    ],
  },
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/admin/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
];
