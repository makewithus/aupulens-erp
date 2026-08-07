import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildBusinessGraph, getOutstandingReceivables } from "@/lib/twin/graph";

/**
 * Digital Business Twin (6.11): the real relationship graph + the outstanding
 * receivables the cash-flow simulation operates on.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;
  const adminGuard = requireAdmin(session);
  if (adminGuard) return adminGuard;

  const [graph, receivables] = await Promise.all([
    buildBusinessGraph(session.user.tenantId),
    getOutstandingReceivables(session.user.tenantId),
  ]);
  return NextResponse.json({ success: true, data: { graph, receivables } });
}
