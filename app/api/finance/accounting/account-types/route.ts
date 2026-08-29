import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AccountType from "@/models/finance/AccountType";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    
    const count = await AccountType.countDocuments({ tenantId });
    if (count === 0) {
      const { seedNewChartOfAccounts } = await import("@/lib/accounting/coa-feature-seeder");
      await seedNewChartOfAccounts(tenantId, session.user.id);
    }

    const accountTypes = await AccountType.find({ tenantId }).sort({ segment: 1, name: 1 });
    return NextResponse.json({ accountTypes });
  } catch (error) {
    console.error("AccountType GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const body = await request.json();
    if (!body.name || !body.segment) {
      return NextResponse.json({ error: "Name and Segment are required" }, { status: 400 });
    }

    const accountType = await AccountType.create({
      ...body,
      tenantId,
      createdBy: session.user.id,
      isSystem: false,
    });

    return NextResponse.json({ accountType }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "Account type with this name already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
