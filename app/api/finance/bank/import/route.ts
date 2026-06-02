import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import BankStatement from "@/models/BankStatement";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const body = await req.json(); // UI sends normalized JSON from CSV/Excel

    await dbConnect();

    // Create a new bank statement
    const statement = new BankStatement({
      ...body,
      tenantId,
    });

    await statement.save();
    return NextResponse.json(statement);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
