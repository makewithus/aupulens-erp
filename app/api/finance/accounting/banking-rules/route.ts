import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BankingRule from "@/models/finance/BankingRule";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const applyTo = searchParams.get("applyTo");

  const query: any = { tenantId };
  if (applyTo) query.applyTo = applyTo;

  const rules = await BankingRule.find(query)
    .populate("accountId", "accountName accountCode")
    .populate("associatedAccountIds", "accountName accountCode")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: rules });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();

    if (!body.ruleName || !body.recordAs || !body.accountId) {
      return NextResponse.json(
        { success: false, message: "Rule Name, Record As, and Account are required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.criteria) || body.criteria.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one criterion is required" },
        { status: 400 },
      );
    }

    const doc = await BankingRule.create({
      ...body,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, message: "A rule with this name already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
