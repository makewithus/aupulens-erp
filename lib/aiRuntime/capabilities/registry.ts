/**
 * The single source of truth for every `not_implemented`/`partial` declaration in the AI runtime
 * (docs/ai/BRIEF-09-VERIFICATION.md 0.2). Built after AI-06's own code contradicted its report:
 * each workflow used to carry its declarations as a local, hand-written array, and nothing told a
 * workflow when a sibling closed the gap it cited — the exact defect class that hit twice
 * (`docs/ai/OPEN_QUESTIONS.md` #36).
 *
 * Workflows READ their own declarations from `getWorkflowGaps(workflowId)` rather than
 * hard-coding `{what, reason}` arrays; `tests/ai/aiRuntime/capabilityRegistryDrift.test.ts`
 * asserts no entry is `not_implemented` while its OWN `resolvedBy` workflow both exists in the
 * registered runtime AND is marked `implemented` elsewhere — the structural check that would have
 * caught the AI-06 staleness bug directly. `docs/ai/README.md`'s inventory is generated from this
 * file (`scripts/generate-capability-inventory.ts`), never hand-maintained, so it cannot drift
 * from the code again.
 */

export type CapabilityStatus = "implemented" | "not_implemented" | "partial";

export interface CapabilityDeclaration {
  /** Stable, unique id — the same string every workflow's own `{what, reason}` list used before
   *  this registry existed, kept unchanged so existing tests asserting on `what`/`capabilityId`
   *  keep passing. */
  capabilityId: string;
  /** Every workflow that has ever cited this gap — a capability can be relevant to more than one
   *  (AI-06 and AI-19 both cite the same vendor-bank-field gap). */
  declaredBy: string[];
  reason: string;
  /** The specific missing field/model/decision blocking it — `null` only for the permanent,
   *  by-design gaps (group consolidation, statutory submission), which have no blocker to name. */
  blockingDependency: string | null;
  status: CapabilityStatus;
  /** Which workflow's own implementation would close (or has closed) this gap, if any — `null`
   *  for a permanent gap with no planned resolution. */
  resolvedBy: string | null;
  /** When `status` moved to `implemented` — a chunk label, not a strict ISO date, matching how
   *  this project's own docs cite "Chunk 8a" etc. throughout. `null` while still open. */
  resolvedAt: string | null;
}

export const CAPABILITY_REGISTRY: CapabilityDeclaration[] = [
  // ── AI-22 reconciliation ──────────────────────────────────────────────────
  {
    capabilityId: "intercompany",
    declaredBy: ["AI-22"],
    reason: "group consolidation requires an entity model that does not exist — see docs/ai/AI-20-ARCHITECTURE-NOTE.md",
    blockingDependency: "a group/entity-hierarchy model",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    capabilityId: "processor_settlement",
    declaredBy: ["AI-22"],
    reason: "no payment processor settlement data source exists",
    blockingDependency: "a payment-processor settlement feed/model",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },

  // ── AI-29 controls ────────────────────────────────────────────────────────
  {
    capabilityId: "sod_permission_conflict",
    declaredBy: ["AI-29"],
    reason: "no role-permission matrix exists anywhere in this codebase (lib/org/rbac.ts has only admin-gate functions, no permission taxonomy) — checking whether one user holds two conflicting permissions would require inventing which permission pairs are mutually exclusive, which this batch does not do",
    blockingDependency: "a real permission taxonomy in lib/org/rbac.ts",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    capabilityId: "access_change_authorised",
    declaredBy: ["AI-29"],
    reason: "ActivityLog.activity/.details are free text with no structured entity/action-type field — matching this to 'a role was changed' would require guessing from prose, the same class of heuristic this project avoids elsewhere",
    blockingDependency: "a structured entity/action-type field on ActivityLog",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },

  // ── Vendor bank-detail field — cited by both AI-06 and AI-19 ─────────────
  {
    capabilityId: "vendor_bank_change_detection",
    declaredBy: ["AI-06", "AI-19"],
    reason: "Vendor/Customer (the AP 'vendor' model) carry no bank-detail field at all, confirmed by schema inspection (docs/ai/SYSTEM_INVENTORY.md 0.3) — AI-19's real hold mechanism only covers Employee.bankDetails/BankAccount, which neither AI-06 nor Vendor/Customer's own records have",
    blockingDependency: "a bank-detail field on Vendor/Customer",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },

  // ── AI-19's remaining two ─────────────────────────────────────────────────
  {
    capabilityId: "expiring_documents",
    declaredBy: ["AI-19"],
    reason: "no tax-certificate/insurance/license expiry field exists anywhere on Vendor or Customer — confirmed, not assumed (docs/ai/SYSTEM_INVENTORY.md)",
    blockingDependency: "an expiry-date field on Vendor/Customer",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    capabilityId: "classification_inconsistencies",
    declaredBy: ["AI-19"],
    reason: "deferred to AI-26 (accounting policy intelligence), which owns cross-transaction treatment consistency — AI-26 implements a real consistency sweep (capitalisation treatment) but not yet a general ACCOUNT-CLASSIFICATION consistency check specifically, so this stays open rather than marked resolved on a partial match",
    blockingDependency: "a classification-consistency detector in AI-26's own sweep",
    status: "not_implemented",
    resolvedBy: "AI-26",
    resolvedAt: null,
  },

  // ── AI-27's credit-note case ──────────────────────────────────────────────
  {
    capabilityId: "credit_note_applied_to_rebill",
    declaredBy: ["AI-27"],
    reason: "Invoice.ts (models/finance/Invoice.ts) has no applied-against/reversal-link field between an out_refund/in_refund and the invoice it offsets — confirmed by schema inspection, nothing to compute this check from",
    blockingDependency: "an applied-against/reversal-link field on Invoice",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },

  // ── AI-30's two ───────────────────────────────────────────────────────────
  {
    capabilityId: "relink_orphan",
    declaredBy: ["AI-30"],
    reason: "surveyed every real parent-child relationship in this schema (AiToolCall.runId, AiDecisionTrace.runId, AiEvent, AiSchedule) — none has a genuine dangling-reference-with-a-determinable-parent pattern; AiWorkflowRun-without-a-trace is a real, detected orphan but has no correct parent to relink to (the trace is missing, not misattached). The generic relink primitive (lib/aiRuntime/opsHealth/relinkOrphan.ts) is built and tested standalone, ready the moment a real case exists.",
    blockingDependency: "a real orphan-with-determinable-parent case in the schema",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    capabilityId: "retry_integration_connection",
    declaredBy: ["AI-30"],
    reason: 'the only re-runnable operation for a third-party connector, testConnection(), mutates and saves the Integration document (models/shared/Integration.ts) — not an Ai* model, so it cannot be an internal_state tool; the normal write path requires a real human userId (routePermissionCheck fails closed without one), which AI-30\'s autonomous "ai.sweep.hourly" trigger never has. No safe write path exists for this repair today (lib/aiRuntime/tools/opsHealthTools.ts).',
    blockingDependency: "a system-principal/service-account concept for autonomous non-Ai* writes",
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },

  // ── Permanent, by-design gaps — no blocker to name, no resolution planned ──
  {
    capabilityId: "group_consolidation",
    declaredBy: ["AI-20"],
    reason: "permanently not_implemented by design, not a gap to close — docs/ai/AI-20-ARCHITECTURE-NOTE.md. AI-20 stops at related-party DETECTION; consolidation itself was never in scope.",
    blockingDependency: null,
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    capabilityId: "statutory_submission",
    declaredBy: ["AI-12", "AI-17"],
    reason: "nothing in this system files anything with a tax authority or regulator, anywhere, by design — AI-12/AI-17 stop at workpaper/readiness output. Not a missing-data gap; a deliberate scope boundary.",
    blockingDependency: null,
    status: "not_implemented",
    resolvedBy: null,
    resolvedAt: null,
  },
];

export function getCapability(capabilityId: string): CapabilityDeclaration | undefined {
  return CAPABILITY_REGISTRY.find((c) => c.capabilityId === capabilityId);
}

/** A workflow's own not-implemented declarations, in the exact `{what, reason}` shape every
 *  workflow's `checksNotImplemented`/`NOT_IMPLEMENTED` proposal field already used — so migrating
 *  a workflow to read from here is a drop-in replacement, not a proposal-shape change. */
export function getWorkflowGaps(workflowId: string): { what: string; reason: string }[] {
  return CAPABILITY_REGISTRY.filter((c) => c.declaredBy.includes(workflowId) && c.status !== "implemented").map((c) => ({ what: c.capabilityId, reason: c.reason }));
}

export function isImplemented(capabilityId: string): boolean {
  return getCapability(capabilityId)?.status === "implemented";
}
