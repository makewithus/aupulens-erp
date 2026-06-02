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
      {
        title: "AI Assistant",
        href: "/finance/ai-assistant",
        icon: Sparkles,
      },
    ],
  },
  {
    title: "Receivables & Payables",
    items: [
      {
        title: "Invoices",
        href: "/finance/invoices",
        icon: Receipt,
      },
      {
        title: "Vendor Bills",
        href: "/finance/bills",
        icon: FileText,
      },
      {
        title: "Aged Partners",
        href: "/finance/accounting/aged-partner",
        icon: Clock,
      },
    ],
  },
  {
    title: "Accounting",
    items: [
      {
        title: "Vouchers",
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
