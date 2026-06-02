import {
  LayoutDashboard,
  Package,
  Layers,
  BarChart3,
  Warehouse,
  Sparkles,
  Truck,
  Factory,
  ArrowDownToLine,
  Shuffle,
  ArrowLeftRight,
} from "lucide-react";

export const inventorySidebarConfig = [
  {
    title: "Overview",
    items: [
      {
        title: "Summary",
        href: "/inventory/summary",
        icon: BarChart3,
      },
      // {
      //   title: "Analytics",
      //   href: "/inventory/analytics",
      //   icon: BarChart3,
      // },
      {
        title: "AI Assistant",
        href: "/inventory/ai-assistant",
        icon: Sparkles,
      },
    ],
  },
  {
    title: "Stock Management",
    items: [
      {
        title: "Stock Tracking",
        href: "/inventory/stock",
        icon: Package,
      },
      // {
      //   title: "Batch & Lot",
      //   href: "/inventory/batch",
      //   icon: Layers,
      // },
      {
        title: "Warehouse",
        href: "/inventory/warehouse",
        icon: Warehouse,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "Receipts",
        href: "/inventory/operations/receipts",
        icon: ArrowDownToLine,
      },
      {
        title: "Deliveries",
        href: "/inventory/operations/deliveries",
        icon: Truck,
      },
      {
        title: "Manufacturing",
        href: "/inventory/operations/manufacturing",
        icon: Factory,
      },
      {
        title: "Returns",
        href: "/inventory/operations/returns",
        icon: Shuffle,
      },
      {
        title: "Stock Moves",
        href: "/inventory/stock-moves",
        icon: ArrowLeftRight,
      },
    ],
  },
  // {
  //   title: "Settings",
  //   items: [
  //     {
  //       title: "Profile",
  //       href: "/inventory/profile",
  //       icon: LayoutDashboard,
  //     },
  //   ],
  // },
];
