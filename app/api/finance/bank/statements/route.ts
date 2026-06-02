import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import BankStatement from "@/models/BankStatement";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    await dbConnect();

    const query: any = { tenantId };
    if (status) query.status = status;

    const items = await BankStatement.find(query)
      .sort({ createdAt: -1 })
      .populate("header.journalId");

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
