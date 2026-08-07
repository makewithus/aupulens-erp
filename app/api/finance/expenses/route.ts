import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";

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

    const query = Expense.find({ tenantId })
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
        Expense.countDocuments({ tenantId }),
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

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
