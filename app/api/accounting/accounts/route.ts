import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Account from "@/models/Account";

const GROUP_MAPPING: Record<string, string> = {
  asset_receivable: "asset",
  asset_cash: "asset",
  asset_current: "asset",
  asset_non_current: "asset",
  asset_prepayments: "asset",
  asset_fixed: "asset",
  liability_payable: "liability",
  liability_credit_card: "liability",
  liability_current: "liability",
  liability_non_current: "liability",
  equity: "equity",
  equity_unaffected: "equity",
  income: "income",
  income_other: "income",
  expense: "expense",
  expense_depreciation: "expense",
  expense_direct_cost: "expense",
  off_balance: "off_balance",
};

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";
    let accounts = await Account.find({
      tenantId,
    })
      .sort({ code: 1 })
      .lean();

    if (accounts.length === 0) {
      try {
        const { seedChartOfAccounts } = await import("@/lib/accounting/coa-seeder");
        await seedChartOfAccounts(tenantId, session.user.id);
        accounts = await Account.find({
          tenantId,
        })
          .sort({ code: 1 })
          .lean();
      } catch (seedError) {
        console.error("Auto-seeding Chart of Accounts failed:", seedError);
      }
    }

    return NextResponse.json({ items: accounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const body = await request.json();

    if (!body.code || !body.name || !body.account_type) {
      return NextResponse.json(
        { error: "Code, Name, and Account Type are required" },
        { status: 400 },
      );
    }

    const internal_group = GROUP_MAPPING[body.account_type];

    const account = await Account.create({
      ...body,
      internal_group,
      tenantId: session.user.tenantId || "default-tenant",
      createdBy: session.user.id,
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { error: "An account with this code already exists" },
        { status: 400 },
      );
    }
    console.error("Error creating account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
