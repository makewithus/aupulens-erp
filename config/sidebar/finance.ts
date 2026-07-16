import {
  LayoutDashboard,
  Receipt,
  TrendingUp,
  CreditCard,
  FileText,
  Building,
  CircleDollarSign,
  Wallet,
  Settings,
  Activity,
  Sparkles,
  BookOpen,
  PieChart,
  BarChart3,
  History,
  Clock,
  Landmark,
  Shuffle,
  FileCheck,
  CalendarDays,
  Scale,
  Package,
} from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const financeSidebarConfig: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/finance/summary",
        icon: LayoutDashboard,
      },
      // {
      //   title: "AI Assistant",
      //   href: "/finance/ai-assistant",
      //   icon: Sparkles,
      // },
    ],
  },
  {
    title: "Accounting",
    items: [
      {
        title: "Chart of Accounts",
        href: "/finance/accounting/chart-of-accounts",
        icon: FileText,
      },
      {
        title: "Transactions",
        href: "/finance/accounting/vouchers",
        icon: FileCheck,
      },
      {
        title: "Journal Entries",
        href: "/finance/accounting/journal-entries",
        icon: BookOpen,
      },
      {
        title: "General Ledger",
        href: "/finance/accounting/ledger",
        icon: FileText,
      },
      {
        title: "Bank Reconciliation",
        href: "/finance/accounting/bank-reconciliation",
        icon: Landmark,
      },
      {
        title: "Period Closing",
        href: "/finance/accounting/period-closing",
        icon: CalendarDays,
      },
      {
        title: "Fixed Assets",
        href: "/finance/accounting/fixed-assets",
        icon: Building,
      },
    ],
  },
  {
    title: "Financial Reports",
    items: [
      {
        title: "Profit & Loss",
        href: "/finance/accounting/profit-loss",
        icon: TrendingUp,
      },
      {
        title: "Balance Sheet",
        href: "/finance/accounting/balance-sheet",
        icon: PieChart,
      },
      {
        title: "Trial Balance",
        href: "/finance/accounting/trial-balance",
        icon: Scale,
      },
      {
        title: "Aged Partners",
        href: "/finance/accounting/aged-partner",
        icon: Clock,
      },
    ],
  },
  {
    title: "Purchases",
    items: [
      {
        title: "Purchase Orders",
        href: "/finance/purchase-orders",
        icon: Package,
      },
      {
        title: "Vendor Bills",
        href: "/finance/bills",
        icon: Receipt,
      },
    ],
  },
  {
    title: "Others",
    items: [
      {
        title: "Employee Expenses",
        href: "/finance/expenses",
        icon: CreditCard,
      },
      {
        title: "Returns",
        href: "/finance/returns",
        icon: Shuffle,
      },
    ],
  },
];
