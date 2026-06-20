import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await dbConnect();

    const items = await Expense.find({ tenantId })
          .populate("employeeId", "name image")
          .populate("accountId", "name code")
          .populate({
            path: "chatter.authorId",
            select: "name image",
            strictPopulate: false,
          })
          .sort({ createdAt: -1 }).lean();

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
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
