import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { annotateStatement } from "@/lib/aiRuntime/statements/annotateStatement";

/**
 * Read-only render of AI-21's annotation layer (docs/ai/BRIEF-06-BATCH-E.md, AI-21) — computed
 * live from `lib/accounting/reports.ts::buildPostedJournalReport()`, the same figures
 * `/finance/reports` itself renders, never a second computation and never a write. Does not touch
 * `/finance/reports` at all (a deliberate separate surface, per the brief). `?period=YYYY-MM`
 * (defaults to the current month) and `?type=balance_sheet|income_statement` (defaults to
 * `balance_sheet`) select what to render.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period = searchParams.get("period") ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const statementType = searchParams.get("type") === "income_statement" ? "income_statement" : "balance_sheet";

    const statement = await annotateStatement(tenantId, period, statementType);
    return NextResponse.json({ statement });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
