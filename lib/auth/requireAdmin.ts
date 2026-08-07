import { NextResponse } from "next/server";

/**
 * Admin-role API guard (Part-A gating parity).
 *
 * Several admin-facing pages (Org Structure, Business Twin) and config-mutating
 * actions (Marketplace publish/install) are reachable only from admin-gated
 * pages in the UI, but their APIs live outside the `/api/admin` middleware
 * prefix — so without this an authenticated NON-admin could call them directly.
 * Returns a 403 NextResponse when the caller isn't admin/master-admin, or null
 * to continue — same "response or null" convention as requireTenantId.
 */
export function requireAdmin(session: any): NextResponse | null {
  const role = session?.user?.role;
  if (role !== "admin" && role !== "master-admin") {
    return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
  }
  return null;
}
