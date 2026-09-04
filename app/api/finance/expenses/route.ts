import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/finance/Expense";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get("page");
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const filter: any = { tenantId };
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) filter.expenseDate = range;
    }

    const query = Expense.find(filter)
          .populate("employeeId", "name image")
          .populate("accountId", "name code")
          .populate({
            path: "chatter.authorId",
            select: "name image",
            strictPopulate: false,
          })
          .sort({ createdAt: -1 });

    if (pageParam) {
      // Paginated mode: only when caller explicitly passes ?page= — matches
      // the backward-compat convention used elsewhere (e.g. hr/employees).
      const page = Math.max(1, parseInt(pageParam));
      const skip = (page - 1) * limit;
      const [total, items] = await Promise.all([
        Expense.countDocuments(filter),
        query.skip(skip).limit(limit).lean(),
      ]);
      return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
    }

    // No ?page= → return all (backward-compat for existing consumers).
    const items = await query.lean();
    return NextResponse.json({ items, total: items.length, page: 1, totalPages: 1 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json();

    await dbConnect();

    const expense = new Expense({
      ...body,
      tenantId,
      // Default to current user if not provided
      employeeId: body.employeeId || session.user.id,
    });

    await expense.save();

    // Additive (docs/ai/BRIEF-02-BATCH-A.md B.2) — never throws back into this route.
    await safeEmitEvent(tenantId, "expense.submitted", {
      expenseId: String(expense._id),
      actingUserId: session.user.id,
    });

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
