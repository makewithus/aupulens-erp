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
  ClipboardList,
  MessageSquare,
  Bell,
  Zap,
  Sparkles,
  UserCheck,
  HelpCircle,
  ShieldCheck,
  FolderOpen,
  Upload,
  Link2,
  UserPlus,
  Smartphone,
  TrendingUp,
  HeartPulse,
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
    title: "Engagement",
    items: [
      {
        title: "Communications",
        href: "/crm/communications",
        icon: MessageSquare,
      },
      {
        title: "Notifications",
        href: "/crm/notifications",
        icon: Bell,
      },
      {
        title: "Onboarding",
        href: "/crm/onboarding",
        icon: UserPlus,
      },
      {
        title: "Handoffs",
        href: "/crm/handoffs",
        icon: UserCheck,
      },
      {
        title: "Support",
        href: "/crm/support",
        icon: HelpCircle,
      },
    ],
  },
  {
    title: "Automation & AI",
    items: [
      {
        title: "Automations",
        href: "/crm/automations",
        icon: Zap,
      },
      {
        title: "Workflows",
        href: "/crm/workflows",
        icon: Activity,
      },
      {
        title: "AI Insights",
        href: "/crm/ai",
        icon: Sparkles,
      },
      {
        title: "AI Control Center",
        href: "/crm/ai/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Data & Integrations",
    items: [
      {
        title: "Documents",
        href: "/crm/documents",
        icon: FolderOpen,
      },
      {
        title: "Import",
        href: "/crm/import",
        icon: Upload,
      },
      {
        title: "Integrations",
        href: "/crm/integrations",
        icon: Link2,
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
        title: "Executive View",
        href: "/crm/executive",
        icon: TrendingUp,
      },
      {
        title: "Compliance",
        href: "/crm/compliance",
        icon: ShieldCheck,
      },
      {
        title: "System Health",
        href: "/crm/system-health",
        icon: HeartPulse,
      },
      {
        title: "Mobile",
        href: "/crm/mobile",
        icon: Smartphone,
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
