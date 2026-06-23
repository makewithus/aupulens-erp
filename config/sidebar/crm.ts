import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Activity,
  CheckSquare,
  LifeBuoy,
  Megaphone,
  FileSignature,
  PieChart,
  CheckCircle,
  Settings,
  ClipboardList
} from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const crmSidebarConfig: SidebarSection[] = [
  {
    title: "CRM",
    items: [
      {
        title: "Dashboard",
        href: "/crm/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Leads",
        href: "/crm/leads",
        icon: Users,
      },
      {
        title: "Accounts",
        href: "/crm/accounts",
        icon: Briefcase,
      },
      {
        title: "Contacts",
        href: "/crm/contacts",
        icon: Users,
      },
      {
        title: "Opportunities",
        href: "/crm/opportunities",
        icon: Briefcase,
      },
      {
        title: "Pipeline",
        href: "/crm/pipeline",
        icon: LayoutDashboard,
      },
      {
        title: "Quotes",
        href: "/crm/quotes",
        icon: FileText,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "Activities",
        href: "/crm/activities",
        icon: Activity,
      },
      {
        title: "Tasks",
        href: "/crm/tasks",
        icon: CheckSquare,
      },
      {
        title: "Cases",
        href: "/crm/cases",
        icon: LifeBuoy,
      },
      {
        title: "Campaigns",
        href: "/crm/campaigns",
        icon: Megaphone,
      },
      {
        title: "Contracts",
        href: "/crm/contracts",
        icon: FileSignature,
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        title: "Reports",
        href: "/crm/reports",
        icon: PieChart,
      },
      {
        title: "Approvals",
        href: "/crm/approvals",
        icon: CheckCircle,
      },
      {
        title: "Settings",
        href: "/crm/settings",
        icon: Settings,
      },
      {
        title: "Audit Logs",
        href: "/crm/audit",
        icon: ClipboardList,
      },
    ],
  },
];
