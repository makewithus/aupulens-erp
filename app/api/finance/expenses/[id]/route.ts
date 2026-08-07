import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import Account from "@/models/Account";
import { DOCUMENT_STATUS, VOUCHER_TYPE } from "@/lib/constants/statuses";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { createPostedJournalEntry } from "@/lib/accounting/posting";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;
    await dbConnect();

    const expense = await Expense.findOne({ _id: id, tenantId })
          .populate("employeeId", "name image")
          .populate("accountId", "name code")
          .populate({
            path: "chatter.authorId",
            select: "name image",
            strictPopulate: false,
          }).lean();

    if (!expense)
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });

    return NextResponse.json(expense);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;
    const body = await req.json();

    await dbConnect();

    // Process chatter: handle populated authorId objects and set authorId for new messages
    if (body.chatter && Array.isArray(body.chatter)) {
      body.chatter = body.chatter.map((msg: any) => {
        let authorId = msg.authorId;
        if (authorId && typeof authorId === "object" && authorId._id) {
          authorId = authorId._id;
        } else if (!authorId) {
          authorId = session.user.id;
        }
        return {
          body: msg.body,
          type: msg.type || "comment",
          createdAt: msg.createdAt || new Date(),
          authorId,
        };
      });
    }

    let expense = await Expense.findOne({ _id: id, tenantId });

    if (!expense)
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });

    // If status is being updated to "posted", handle Journal Entry creation
    if (body.status === DOCUMENT_STATUS.POSTED && expense.status !== DOCUMENT_STATUS.POSTED) {
      await ensureChartOfAccounts(tenantId, session.user.id);

      // 1. Find suitable credit account
      let creditAccountId = body.paymentAccountId || expense.paymentAccountId;

      if (!creditAccountId) {
        if (expense.paidBy === "company") {
          const cashAcc = await Account.findOne({
            tenantId,
            account_type: "asset_cash",
          });
          creditAccountId = cashAcc?._id;
        } else {
          const payableAcc = await Account.findOne({
            tenantId,
            account_type: "liability_payable",
          });
          creditAccountId = payableAcc?._id;
        }
      }

      if (!creditAccountId) {
        return NextResponse.json(
          {
            error: `No suitable ${expense.paidBy === "company" ? "Cash/Bank" : "Payable"} account found for posting. Please select one in the Accounting tab.`,
          },
          { status: 400 },
        );
      }

      // 2. Create Journal Entry
      const entryName = `EXP/${expense._id.toString().slice(-6).toUpperCase()}`;

      const journalEntry = await createPostedJournalEntry({
        tenantId,
        header: {
          name: entryName,
          date: new Date(),
          ref: expense.description,
          journalType: expense.paidBy === "company" ? "cash" : "purchase",
        },
        voucherType:
          expense.paidBy === "company" ? VOUCHER_TYPE.PAYMENT : VOUCHER_TYPE.PURCHASE,
        lineIds: [
          {
            accountId: expense.accountId, // Debit Expense
            label: expense.description,
            debit: expense.total,
            credit: 0,
          },
          {
            accountId: creditAccountId, // Credit Cash/Payable
            label: `Payment for: ${expense.description}`,
            debit: 0,
            credit: expense.total,
          },
        ],
        totals: {
          amountUntaxed: expense.total - (expense.taxAmount || 0),
          amountTax: expense.taxAmount || 0,
          amountTotal: expense.total,
        },
        createdBy: session.user.id,
      });

      body.journalEntryId = journalEntry._id;

      // Add notification to chatter
      body.chatter = [
        ...(expense.chatter || []),
        {
          body: `Journal Entry ${entryName} generated and posted.`,
          type: "notification",
          authorId: session.user.id,
          createdAt: new Date(),
        },
      ];
    }

    expense = await Expense.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    ).populate({
      path: "chatter.authorId",
      select: "name image",
      strictPopulate: false,
    });

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;
    await dbConnect();

    const expense = await Expense.findOneAndDelete({
      _id: id,
      tenantId,
    });

    if (!expense)
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
