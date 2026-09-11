import { OrganizationStatus } from "@/lib/constants/statuses";

/**
 * Client-safe types/constants shared between lib/platform/organizations/*.ts
 * (server, Mongoose-backed) and app/platform/(app)/organizations/**
 * ("use client" pages). Never import list.ts/detail.ts/create.ts's runtime
 * values from a client component — those files import Mongoose models at
 * module scope and would pull server-only code into the browser bundle.
 */
export interface OrganizationListRow {
  id: string;
  name: string;
  subdomain: string;
  organizationType?: string;
  country?: string;
  region?: string;
  tier: string;
  status: OrganizationStatus;
  activeUserCount: number;
  currentPeriodAiUsage: number;
  aiUsagePercent: number | null;
  createdAt: string;
  lastMeaningfulActivityAt: string | null;
}

export const LAST_MEANINGFUL_ACTIVITY_DEFINITION =
  "Most recent recorded admin-panel activity for this organisation, or its last record update if none has been logged yet. Login and AI-usage timestamps are not yet tracked at the per-event level in this codebase, so they cannot contribute to this figure — see docs/admin/SYSTEM_INVENTORY_DELTA.md.";
