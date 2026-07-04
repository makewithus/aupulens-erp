import {
  LayoutDashboard,
  FileText,
  Package,
  ClipboardList,
  Truck,
  FileSpreadsheet,
  Settings,
  BarChart3,
  Sparkles,
  Tag,
  Users,
  GitBranch,
  Banknote,
  FileMinus,
  Repeat,
} from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const salesSidebarConfig: SidebarSection[] = [
  {
    title: "Pipeline",
    items: [
      {
        title: "Q2C Pipeline",
        href: "/sales/pipeline",
        icon: GitBranch,
      },
    ],
  },
  {
    title: "Orders",
    items: [
      {
        title: "Quotations",
        href: "/sales/quotations",
        icon: ClipboardList,
      },
      {
        title: "Orders",
        href: "/sales/orders",
        icon: Package,
      },
      {
        title: "Pro Forma Invoices",
        href: "/sales/proforma-invoices",
        icon: FileText,
      },
    ],
  },
  {
    title: "Sales",
    items: [
      {
        title: "Invoices",
        href: "/sales/invoices",
        icon: Banknote,
      },
      {
        title: "Credit Notes",
        href: "/sales/credit-notes",
        icon: FileMinus,
        disabled: true,
      },
      {
        title: "E-Invoices",
        href: "/sales/e-invoices",
        icon: FileText,
      },
      {
        title: "Subscriptions",
        href: "/sales/subscriptions",
        icon: Repeat,
        disabled: true,
      },
    ],
  },
  {
    title: "Catalog",
    items: [
      {
        title: "Products",
        href: "/sales/products",
        icon: Package,
      },
      {
        title: "Pricelists",
        href: "/sales/pricelist",
        icon: Tag,
      },
    ],
  },
  {
    title: "Relationships",
    items: [
      {
        title: "Customers",
        href: "/sales/customers",
        icon: Users,
      },
    ],
  },
  {
    title: "Logistics",
    items: [
      {
        title: "Delivery Challans",
        href: "/sales/delivery-challans",
        icon: Truck,
      },
      {
        title: "Export Docs",
        href: "/sales/export-docs",
        icon: FileSpreadsheet,
      },
    ],
  },
  {
    title: "Analytics",
    items: [
      {
        title: "Dashboard",
        href: "/sales/summary",
        icon: LayoutDashboard,
      },
      {
        title: "Visualization",
        href: "/sales/visualization",
        icon: BarChart3,
      },
      {
        title: "AI Assistant",
        href: "/sales/ai-assistant",
        icon: Sparkles,
      },
    ],
  },
];
