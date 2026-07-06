import { NextResponse } from "next/server";

/**
 * First slice of the QA_GAP_REPORT.md #21 tenantId-fallback hardening: the
 * codebase-wide `(session.user as any).tenantId || "default-tenant"` pattern
 * means a session that's authenticated but missing tenantId (e.g. a future
 * JWT/session regression) silently reads/writes the shared "default-tenant"
 * bucket instead of failing loudly. Scoped to the highest-risk WRITE paths
 * only (Finance: journal entries, invoices, bills, reconciliation, vendor
 * payments; HR payroll) per the report's own "don't attempt the full
 * ~226-file remediation in one pass" guidance — reads elsewhere are
 * unaffected.
 *
 * Returns a 401 NextResponse when the session has no real tenantId, or null
 * to let the caller continue with `session.user.tenantId` — same
 * "response or null" convention as lib/crm/rbac.ts and
 * lib/middleware/moduleGate.ts.
 */
export function requireTenantId(session: any): NextResponse | null {
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json(
      { error: "Unauthorized: tenant context missing from session" },
      { status: 401 },
    );
  }
  return null;
}
