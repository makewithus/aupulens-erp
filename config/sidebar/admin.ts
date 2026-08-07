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
  CreditCard,
  CalendarDays,
  Building2,
  Network,
  Store,
  DatabaseZap,
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
    title: "Enterprise",
    items: [
      {
        title: "Data Migration",
        href: "/migration",
        icon: DatabaseZap,
      },
      {
        title: "Calendar",
        href: "/calendar",
        icon: CalendarDays,
      },
      {
        title: "Org Structure",
        href: "/admin/org-structure",
        icon: Building2,
      },
      {
        title: "Business Twin",
        href: "/admin/business-twin",
        icon: Network,
      },
      {
        title: "Marketplace",
        href: "/marketplace",
        icon: Store,
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        title: "Reports",
        href: "/admin/reports",
        icon: FileText,
      },
      {
        title: "AI Studio",
        href: "/admin/ai-studio",
        icon: Sparkles,
      },
      {
        title: "Settings",
        href: "/admin/settings",
        icon: Settings,
      },
      {
        title: "Billing",
        href: "/admin/billing",
        icon: CreditCard,
      },
    ],
  },
];
