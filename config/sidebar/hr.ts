import {
  LayoutDashboard,
  Users,
  Calendar,
  DollarSign,
  Clock,
  UserPlus,
  UserMinus,
  Building2,
  FileText,
  Sparkles,
  CalendarCheck,
  BarChart3,
  ClipboardList,
} from "lucide-react";
import { SidebarSection } from "@/components/dashboard/DashboardSidebar";

export const hrSidebarConfig: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/hr/dashboard", icon: LayoutDashboard },
      { title: "AI Assistant", href: "/hr/ai-assistant", icon: Sparkles },
    ],
  },
  {
    title: "Employee Management",
    items: [
      { title: "Employees", href: "/hr/employees", icon: Users },
      { title: "Departments", href: "/hr/departments", icon: Building2 },
      { title: "Onboarding", href: "/hr/onboarding", icon: UserPlus },
      { title: "Exit & Clearance", href: "/hr/exit", icon: UserMinus },
    ],
  },
  {
    title: "Time & Attendance",
    items: [
      { title: "Attendance", href: "/hr/attendance", icon: CalendarCheck },
      { title: "Leave Requests", href: "/hr/leave", icon: Calendar },
    ],
  },
  {
    title: "Payroll",
    items: [
      { title: "Payroll Processing", href: "/hr/payroll", icon: DollarSign },
    ],
  },
  {
    title: "Performance",
    items: [
      { title: "Performance", href: "/hr/performance", icon: BarChart3 },
    ],
  },
  {
    title: "Reports",
    items: [
      { title: "HR Reports", href: "/hr/reports", icon: FileText },
    ],
  },
];
