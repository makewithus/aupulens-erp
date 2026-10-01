import { LayoutDashboard, FolderKanban } from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const projectsSidebarConfig: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/projects/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
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
];
