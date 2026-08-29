import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "active";
    
    let query: any = { tenantId };
    if (view === "active") query.isActive = true;
    else if (view === "inactive") query.isActive = false;

    // Check if seeded based on Account Types or missing accounts
    const AccountType = (await import("@/models/finance/AccountType")).default;
    const [typeCount, accountCount] = await Promise.all([
      AccountType.countDocuments({ tenantId }),
      Account.countDocuments({ tenantId }),
    ]);
    if (typeCount === 0 || accountCount < 78) {
      const { seedNewChartOfAccounts } = await import("@/lib/accounting/coa-feature-seeder");
      await seedNewChartOfAccounts(tenantId, session.user.id);
    }

    const accounts = await Account.find(query)
      .populate("accountType", "name segment")
      .populate("parentAccountId", "accountName")
      .sort({ accountName: 1 })
      .lean();
      
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Account GET Error:", error);
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
    if (!body.accountName || !body.accountType) {
      return NextResponse.json({ error: "Account Name and Account Type are required" }, { status: 400 });
    }

    if (!body.accountCode) delete body.accountCode;

    const account = await Account.create({
      ...body,
      tenantId,
      createdBy: session.user.id,
      isLocked: false,
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "Account with this name or code already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
