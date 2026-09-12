import { NextResponse } from "next/server";
import { resolveEntitlements } from "./resolve";

/**
 * The one enforcement primitive every tenant-facing route calls (Phase 3b).
 * Deliberately a single function, not a middleware layer or a new
 * abstraction over existing routes — inserted as one additional line in the
 * exact same auth() → tenantId → connectDB() sequence every route already
 * follows (docs/_context/CONVENTIONS.md), so a route that adopts this looks
 * like every other route in the codebase plus one line, not a rewrite.
 *
 * Fails open, not closed, when the resolver itself is in its own permissive-
 * default failure mode (Phase 3a's own contract) — an entitlement-resolution
 * error must never compound into "and now the customer's own accounting
 * route is blocked too." A wrong ALLOW is recoverable; a wrong BLOCK is a
 * paying customer locked out (the brief's own stated risk for this phase).
 *
 * RECONCILIATION WITH lib/middleware/moduleGate.ts (Phase 9,
 * docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part 1.3): both this file and
 * moduleGate now call `resolveEntitlements()` for a tenant with an explicit
 * `OrganizationEntitlement` row — they share the identical resolution path,
 * not two independent ones, so they cannot disagree for that case. For a
 * tenant with NO entitlement row, moduleGate deliberately skips
 * `resolveEntitlements()` entirely and reads `lib/constants/tiers.ts`
 * directly (zero new code path for an untouched tenant — the addendum's own
 * safety requirement); this file still calls `resolveEntitlements()`
 * unconditionally, which resolves the SAME tenant to the SAME module set via
 * the tier-bridge (`bridgeTierToPlanKey`) now that the Plan catalogue's
 * STARTER/PRO/ENTERPRISE definitions were corrected to match `tiers.ts`
 * byte-for-byte. `tests/platform/tierEntitlementBridge.test.ts` proves this
 * equivalence directly rather than leaving it as an assertion — if a future
 * edit to the catalogue drifts from `tiers.ts` again, that test fails before
 * a tenant's access silently changes.
 *
 * DECISION: this primitive is the correct (and only) enforcement mechanism
 * for any route outside moduleGate's covered prefixes (`admin`, `finance`,
 * `sales`, `inventory`, `manufacturing`, `hr`, `crm` — see
 * `lib/middleware/moduleGate.ts::MODULE_PATH_MAP`). For a route INSIDE those
 * prefixes (like `app/api/inventory/orders`, Phase 3b's one wired route),
 * moduleGate already enforces the same decision at the middleware layer
 * before the request reaches the handler at all; this file's call there is
 * now redundant-but-harmless defense-in-depth, kept rather than removed
 * because (a) it is what makes that route's entitlement behaviour directly
 * unit-testable without a running server/middleware, and (b) removing a
 * working, tested check for no functional gain is not this project's style.
 * Do not wire this primitive into a NEW route inside moduleGate's prefixes —
 * moduleGate already covers it.
 */
export async function moduleIsEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
  const entitlements = await resolveEntitlements(tenantId);
  if (entitlements.source === "permissive_default") return true;
  return entitlements.modules.includes(moduleKey);
}

/**
 * Returns a ready-to-return NextResponse when the module is not entitled,
 * or `null` when the caller should proceed. Response shape matches this
 * repo's `{success:false, message}` convention (docs/_context/CONVENTIONS.md)
 * — note this specific route (app/api/inventory/orders) predates that
 * convention and uses `{error}` instead; new call sites should prefer
 * `{success:false, message}` and this helper supports either via the
 * `legacyErrorShape` option so wiring it in never changes a route's existing
 * response contract.
 */
export async function requireModuleEnabled(
  tenantId: string,
  moduleKey: string,
  options: { legacyErrorShape?: boolean } = {},
): Promise<NextResponse | null> {
  const enabled = await moduleIsEnabled(tenantId, moduleKey);
  if (enabled) return null;

  const message = `Your current plan does not include the "${moduleKey}" module. Contact your workspace admin to upgrade.`;
  return NextResponse.json(
    options.legacyErrorShape ? { error: message } : { success: false, message },
    { status: 403 },
  );
}
