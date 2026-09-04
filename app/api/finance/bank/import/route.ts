import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import BankStatement from "@/models/finance/BankStatement";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json(); // UI sends normalized JSON from CSV/Excel

    await dbConnect();

    // Create a new bank statement
    const statement = new BankStatement({
      ...body,
      tenantId,
    });

    await statement.save();

    // Additive (docs/ai/BRIEF-02-BATCH-A.md B.2) — never throws back into this route.
    await safeEmitEvent(tenantId, "bank.transaction.imported", {
      bankStatementId: String(statement._id),
      actingUserId: (session.user as any).id,
    });

    return NextResponse.json(statement);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
