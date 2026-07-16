import {
  LayoutDashboard,
  Truck,
  Package,
  Ship,
  Plane,
  FileText,
  Globe,
  MapPin,
  BarChart3,
  Settings,
  Activity,
  Sparkles,
  Factory,
  Tag,
} from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const manufacturingSidebarConfig: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/manufacturing/dashboard",
        icon: LayoutDashboard,
      },
      // {
      //   title: "AI Assistant",
      //   href: "/manufacturing/ai-assistant",
      //   icon: Sparkles,
      // },
    ],
  },
  {
    title: "Items",
    items: [
      {
        title: "Items",
        href: "/manufacturing/items",
        icon: Tag,
      },
    ],
  },
  {
    title: "Products",
    items: [
      {
        title: "Products",
        href: "/manufacturing/products",
        icon: Package,
      },
      {
        title: "Bills of Materials",
        href: "/manufacturing/bom",
        icon: FileText,
      },
    ],
  },
  {
    title: "Logistics & Shipping",
    items: [
      {
        title: "Shipments",
        href: "/manufacturing/shipments",
        icon: Truck,
      },
      {
        title: "Freight Providers",
        href: "/manufacturing/freight-providers",
        icon: Ship,
      },
      {
        title: "Tracking",
        href: "/manufacturing/tracking",
        icon: MapPin,
      },
    ],
  },
  {
    title: "Customs & Compliance",
    items: [
      {
        title: "Customs Clearance",
        href: "/manufacturing/customs-clearance",
        icon: FileText,
      },
      {
        title: "HS Code Management",
        href: "/manufacturing/hs-codes",
        icon: Globe,
      },
      {
        title: "Documentation",
        href: "/manufacturing/documentation",
        icon: Package,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "Manufacturing Orders",
        href: "/manufacturing/manufacturing",
        icon: Factory,
      },
      {
        title: "Reports",
        href: "/manufacturing/reports",
        icon: BarChart3,
      },
      {
        title: "Air Freight",
        href: "/manufacturing/air-freight",
        icon: Plane,
      },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        title: 'Activity Logs',
        href: '/manufacturing/activity-logs',
        icon: Activity,
      },
    ],
  },
];
