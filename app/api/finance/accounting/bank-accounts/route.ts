import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BankAccount from "@/models/finance/BankAccount";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";
import { BANK_ACCOUNT_TYPE } from "@/lib/constants/statuses";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const accounts = await BankAccount.find({ tenantId: session.user.tenantId })
    .populate("glAccountId", "accountName accountCode")
    .populate("userIds", "name email")
    .sort({ isPrimary: -1, createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: accounts });
}

/**
 * Creates a manually-added bank/credit-card account and links it to a new
 * (or existing, by name) Chart of Accounts entry under the "Bank" or
 * "Credit Card" AccountType — mirroring how adding a bank account in Zoho
 * Books also creates the corresponding GL account.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();
    const tenantId = session.user.tenantId;

    if (!body.accountName || !body.currency) {
      return NextResponse.json({ success: false, message: "Account Name and Currency are required" }, { status: 400 });
    }

    const accountType = body.accountType === BANK_ACCOUNT_TYPE.CREDIT_CARD ? BANK_ACCOUNT_TYPE.CREDIT_CARD : BANK_ACCOUNT_TYPE.BANK;
    const glTypeName = accountType === BANK_ACCOUNT_TYPE.CREDIT_CARD ? "Credit Card" : "Bank";

    const glType = await AccountType.findOne({ tenantId, name: glTypeName });
    if (!glType) {
      return NextResponse.json(
        { success: false, message: `Chart of Accounts is not seeded yet — visit Chart of Accounts once first.` },
        { status: 400 },
      );
    }

    let glAccount = await Account.findOne({ tenantId, accountName: body.accountName });
    if (!glAccount) {
      glAccount = await Account.create({
        tenantId,
        accountName: body.accountName,
        accountCode: body.accountCode || undefined,
        accountType: glType._id,
        description: body.description,
        createdBy: session.user.id,
        isActive: true,
      });
    }

    const doc = await BankAccount.create({
      tenantId,
      accountType,
      accountName: body.accountName,
      accountCode: body.accountCode,
      currency: body.currency,
      accountNumber: body.accountNumber,
      bankName: body.bankName,
      ifsc: body.ifsc,
      userIds: body.userIds || [],
      description: body.description,
      isPrimary: !!body.isPrimary,
      glAccountId: glAccount._id,
      createdBy: session.user.id,
    });

    if (doc.isPrimary) {
      await BankAccount.updateMany({ tenantId, _id: { $ne: doc._id } }, { $set: { isPrimary: false } });
    }

    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "An account with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
