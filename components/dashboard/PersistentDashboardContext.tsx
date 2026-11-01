"use client";

import { createContext, useContext, type MutableRefObject } from "react";
import type { BreadcrumbItem } from "./DashboardHeader";

export interface PersistentDashboardDetails {
  sidebarSections?: any[];
  companyName?: string;
  dashboardTitle?: string;
  pageName?: string;
  breadcrumbs?: BreadcrumbItem[];
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSignOut?: () => void;
  onRefresh?: () => void | Promise<void>;
  profilePath?: string;
}

export const PersistentDashboardContext = createContext<{
  update: (details: PersistentDashboardDetails) => void;
  refreshRef: MutableRefObject<PersistentDashboardDetails["onRefresh"]>;
} | null>(null);

export function usePersistentDashboard() {
  return useContext(PersistentDashboardContext);
}
