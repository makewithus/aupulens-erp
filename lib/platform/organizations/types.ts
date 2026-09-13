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
  timezone?: string;
  /**
   * Phase 11 Part 1.1: this used to be the raw, legacy `Organization.tier`
   * field — which silently diverges from what the Subscription tab shows
   * for any organisation with an assigned plan or override, since that tab
   * resolves through `resolveEntitlements()` and this one didn't. Now the
   * same entitlement-resolved plan key, so the list and the detail tab can
   * never show two different plans for the same organisation again.
   */
  planKey: string;
  status: OrganizationStatus;
  activeUserCount: number;
  currentPeriodAiUsage: number;
  aiUsagePercent: number | null;
  createdAt: string;
  lastMeaningfulActivityAt: string | null;
}

/**
 * Phase 11 Part 1.2, Modules tab. The fixed set of tenant modules this
 * codebase actually gates on — matches `lib/constants/tiers.ts::TIER_LIMITS`
 * and `lib/middleware/moduleGate.ts::MODULE_PATH_MAP` exactly (both are the
 * real enforcement points; this is a display-layer catalogue, not a third
 * source of truth — a module absent from either of those two lists would
 * mean something exists here that gates nothing real).
 */
export const ALL_TENANT_MODULES = ["admin", "finance", "sales", "inventory", "manufacturing", "hr", "crm"] as const;
export type TenantModule = (typeof ALL_TENANT_MODULES)[number];

export const LAST_MEANINGFUL_ACTIVITY_DEFINITION =
  "Most recent recorded admin-panel activity for this organisation, or its last record update if none has been logged yet. Login and AI-usage timestamps are not yet tracked at the per-event level in this codebase, so they cannot contribute to this figure — see docs/admin/SYSTEM_INVENTORY_DELTA.md.";

/**
 * Source doc §20 (Phase 9 Addendum C Part 2): the specification's per-
 * organisation-type log profiles are TENANT MODULE names (e.g. SME →
 * Accounting, Sales, Purchase, Inventory, Tax, AI, Users), not platform
 * audit categories. `ActivityLog` — the tenant-facing activity feed this
 * tab reads — is free text with a single writer (lib/logger.ts) and no
 * structured module field at all; deriving one by parsing the free-text
 * `activity` string would be guessing from prose, the exact heuristic this
 * project has declined to use everywhere else it came up. So the module-
 * name axis is declared not possible for THIS view; what IS built
 * (`OrganizationType.defaultConfig.logProfile`, a platform AUDIT-CATEGORY
 * filter surfaced on the Audit Logs tab) is a real, different axis, and
 * this note exists so a tester expecting one doesn't mistake it for the
 * other.
 */
export const ACTIVITY_MODULE_FILTER_NOTE =
  "This organisation type's log profile (source doc §20) filters platform AUDIT categories on the Audit Logs tab, not the module names shown in the source specification (e.g. Accounting, Sales, Inventory) — the underlying Activity Log here is free text with no structured module field, and guessing one from the text would be unreliable. Module-based filtering is not available on this tab.";
