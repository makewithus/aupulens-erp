import {
  LayoutDashboard,
  Users,
  Settings,
  FileText,
  BarChart3,
  Package,
  ShoppingCart,
  Briefcase,
  Factory,
  DollarSign,
  UserCog,
  User as UserIcon,
  Activity,
  Sparkles,
  CheckSquare,
  Truck,
} from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const adminSidebarConfig: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/admin/dashboard",
        icon: LayoutDashboard,
      },
      // {
      //   title: "Analytics",
      //   href: "/admin/analytics",
      //   icon: BarChart3,
      // },
      {
        title: "AI Assistant",
        href: "/admin/ai-assistant",
        icon: Sparkles,
      },
    ],
  },
  // {
  //   title: "Operations",
  //   items: [
  //     {
  //       title: "Tasks & Projects",
  //       href: "/admin/tasks",
  //       icon: CheckSquare,
  //     },
  //     {
  //       title: "Vendor Evaluation",
  //       href: "/admin/vendors",
  //       icon: Truck,
  //     },
  //   ],
  // },
  {
    title: "User Management",
    items: [
      {
        title: "All Users",
        href: "/admin/users",
        icon: Users,
      },
      {
        title: "My Profile",
        href: "/admin/profile",
        icon: UserIcon,
      },
      {
        title: "Activity Logs",
        href: "/admin/activity-logs",
        icon: Activity,
      },
      // {
      //   title: 'Roles & Permissions',
      //   href: '/admin/roles',
      //   icon: UserCog,
      //   disabled: true,
      // },
    ],
  },
  // {
  //   title: "Departments",
  //   items: [
  //     {
  //       title: "Finance",
  //       href: "/finance/summary",
  //       icon: DollarSign,
  //     },
  //     {
  //       title: "Sales",
  //       href: "/sales/summary",
  //       icon: ShoppingCart,
  //     },
  //     {
  //       title: "Inventory",
  //       href: "/inventory/dashboard",
  //       icon: Package,
  //     },
  //     {
  //       title: "Manufacturing",
  //       href: "/manufacturing/dashboard",
  //       icon: Factory,
  //     },
  //   ],
  // },
  {
    title: "System",
    items: [
      {
        title: "Reports",
        href: "/admin/reports",
        icon: FileText,
      },
      // {
      //   title: 'Settings',
      //   href: '/admin/settings',
      //   icon: Settings,
      //   disabled: true,
      // },
    ],
  },
];
