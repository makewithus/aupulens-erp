import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getOutstandingReceivables } from "@/lib/twin/graph";
import { simulateInvoiceDelay } from "@/lib/twin/cashflow";

/**
 * Digital Business Twin cash-flow simulation (6.11): "what if invoice X is paid
 * N days late?" — projects the weekly cash position vs the baseline over the
 * chosen horizon, from the tenant's real outstanding receivables.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;
  const adminGuard = requireAdmin(session);
  if (adminGuard) return adminGuard;

  const body = await req.json();
  const invoiceId = body.invoiceId;
  const daysLate = Number(body.daysLate) || 30;
  const weeks = Math.min(Math.max(Number(body.weeks) || 12, 4), 26);
  const openingBalance = Number(body.openingBalance) || 0;

  if (!invoiceId) return NextResponse.json({ success: false, message: "invoiceId is required" }, { status: 400 });

  const receivables = await getOutstandingReceivables(session.user.tenantId);
  const result = simulateInvoiceDelay(receivables, invoiceId, daysLate, new Date(), weeks, openingBalance);

  if ("error" in result) return NextResponse.json({ success: false, message: result.error }, { status: 404 });
  return NextResponse.json({ success: true, data: result });
}
