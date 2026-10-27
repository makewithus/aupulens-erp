import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";

// Account-type names (new Chart-of-Accounts-feature catalog) that represent
// a bank/cash ledger — used to filter "Deposit To" / bank-account pickers
// across Payments and Journal Entries so they don't list every ledger account.
const BANK_CASH_TYPE_NAMES = ["Bank", "Cash"];
// Equivalent value on the older `account_type` string field (pre-dates the
// AccountType catalog; this schema has no separate "asset_bank" value —
// "asset_cash" is the bucket both cash and bank ledgers use).
const BANK_CASH_ACCOUNT_TYPE = "asset_cash";

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

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (!["finance", "admin", "master-admin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden: Finance role required" }, { status: 403 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const query: any = { tenantId };

    const type = request.nextUrl.searchParams.get("type");
    if (type === "tds-receivable") {
      const { ensureChartOfAccounts } = await import("@/lib/accounting/coa-seeder");
      await ensureChartOfAccounts(tenantId, session.user.id);
      query.account_type = "asset_current";
      query.name = /TDS/i;
    }
    if (type === "bank") {
      const bankCashTypeIds = await AccountType.find(
        { tenantId, name: { $in: BANK_CASH_TYPE_NAMES } },
        "_id"
      ).lean();
      query.$or = [
        { account_type: BANK_CASH_ACCOUNT_TYPE },
        { accountType: { $in: bankCashTypeIds.map((t) => t._id) } },
      ];
      query.isActive = { $ne: false };
      query.status = { $ne: "inactive" };
    }

    let accounts = await Account.find(query)
      .sort({ code: 1 })
      .lean();

    if (accounts.length === 0 && !type) {
      try {
        const { seedChartOfAccounts } = await import("@/lib/accounting/coa-seeder");
        const { seedNewChartOfAccounts } = await import("@/lib/accounting/coa-feature-seeder");
        await seedChartOfAccounts(tenantId, session.user.id);
        await seedNewChartOfAccounts(tenantId, session.user.id);
        accounts = await Account.find(query)
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

    const role = (session.user as any)?.role;
    if (!["finance", "admin", "master-admin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden: Finance role required" }, { status: 403 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

const body = stripProtectedFields(await request.json());

    if (!body.code || !body.name || !body.account_type) {
      return NextResponse.json(
        { error: "Code, Name, and Account Type are required" },
        { status: 400 },
      );
    }

    const internal_group = GROUP_MAPPING[body.account_type];
    if (!internal_group) {
      return NextResponse.json(
        { error: `Invalid account_type '${body.account_type}'. Must be mapped to an internal_group.` },
        { status: 400 },
      );
    }

    // AUP-003: Strict allowlist on account creation
    const account = await Account.create({
      code: String(body.code).trim(),
      name: String(body.name).trim(),
      account_type: body.account_type,
      internal_group,
      description: body.description ? String(body.description).trim() : undefined,
      reconcile: Boolean(body.reconcile),
      parentCode: body.parentCode || undefined,
      tenantId,
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
