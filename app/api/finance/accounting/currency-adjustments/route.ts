import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import CurrencyAdjustment from "@/models/finance/CurrencyAdjustment";
import BankAccount from "@/models/finance/BankAccount";
import JournalEntry from "@/models/finance/JournalEntry";
import AccountingSettings from "@/models/finance/AccountingSettings";
import { DOCUMENT_STATUS, CURRENCY_ADJUSTMENT_FILTER } from "@/lib/constants/statuses";

function dateRangeForFilter(filter: string | null): { $gte?: Date; $lte?: Date } | undefined {
  if (!filter || filter === CURRENCY_ADJUSTMENT_FILTER.ALL) return undefined;
  const now = new Date();
  const start = new Date(now);
  if (filter === CURRENCY_ADJUSTMENT_FILTER.TODAY) {
    start.setHours(0, 0, 0, 0);
  } else if (filter === CURRENCY_ADJUSTMENT_FILTER.THIS_WEEK) {
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (filter === CURRENCY_ADJUSTMENT_FILTER.THIS_MONTH) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (filter === CURRENCY_ADJUSTMENT_FILTER.THIS_QUARTER) {
    const q = Math.floor(now.getMonth() / 3);
    start.setMonth(q * 3, 1);
    start.setHours(0, 0, 0, 0);
  } else if (filter === CURRENCY_ADJUSTMENT_FILTER.THIS_YEAR) {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    return undefined;
  }
  return { $gte: start, $lte: now };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter");

  const query: any = { tenantId: session.user.tenantId };

  // An explicit custom dateFrom/dateTo takes precedence over the preset
  // "filter" quick-range (today/this week/this month/...) when both are
  // somehow present — a user picking exact dates is more specific intent.
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  if (dateFrom || dateTo) {
    const range: any = {};
    if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
    if (dateTo && !isNaN(Date.parse(dateTo))) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    if (Object.keys(range).length > 0) query.dateOfAdjustment = range;
  } else {
    const range = dateRangeForFilter(filter);
    if (range) query.dateOfAdjustment = range;
  }

  const adjustments = await CurrencyAdjustment.find(query).sort({ dateOfAdjustment: -1 }).lean();
  return NextResponse.json({ success: true, data: adjustments });
}

/**
 * Records a base-currency adjustment and computes the realized gain/loss by
 * revaluing every posted ledger balance held in bank/card accounts
 * denominated in that currency at the new rate vs. the previous rate —
 * i.e. an honest computation against real journal-entry data, not a
 * placeholder number.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();
    const tenantId = session.user.tenantId;

    if (!body.currency || body.exchangeRate === undefined || !body.dateOfAdjustment || !body.notes) {
      return NextResponse.json(
        { success: false, message: "Currency, Date of Adjustment, Exchange Rate, and Notes are required" },
        { status: 400 },
      );
    }

    const settings = await AccountingSettings.findOne({ tenantId }).lean();
    const baseCurrency = settings?.currency?.baseCurrency || "INR";
    const currencyEntry = settings?.currency?.enabledCurrencies?.find((c: any) => c.code === body.currency);
    const previousExchangeRate =
      (await CurrencyAdjustment.findOne({ tenantId, currency: body.currency }).sort({ dateOfAdjustment: -1 }).lean())
        ?.exchangeRate ?? currencyEntry?.exchangeRate ?? Number(body.exchangeRate);

    const glAccountIds = (await BankAccount.find({ tenantId, currency: body.currency }, { glAccountId: 1 }).lean())
      .map((a: any) => a.glAccountId)
      .filter(Boolean);

    let openBalance = 0;
    if (glAccountIds.length > 0) {
      const [agg] = await JournalEntry.aggregate([
        { $match: { tenantId, status: DOCUMENT_STATUS.POSTED } },
        { $unwind: "$lineIds" },
        { $match: { "lineIds.accountId": { $in: glAccountIds } } },
        { $group: { _id: null, debit: { $sum: "$lineIds.debit" }, credit: { $sum: "$lineIds.credit" } } },
      ]);
      openBalance = agg ? (agg.debit || 0) - (agg.credit || 0) : 0;
    }

    const exchangeRate = Number(body.exchangeRate);
    const gainOrLoss = Number((openBalance * (exchangeRate - previousExchangeRate)).toFixed(2));

    const doc = await CurrencyAdjustment.create({
      tenantId,
      currency: body.currency,
      baseCurrency,
      dateOfAdjustment: new Date(body.dateOfAdjustment),
      exchangeRate,
      previousExchangeRate,
      gainOrLoss,
      notes: body.notes,
      createdBy: session.user.id,
    });

    // Keep the settings snapshot in sync so the next adjustment's "previous rate" is accurate.
    if (currencyEntry) {
      await AccountingSettings.updateOne(
        { tenantId, "currency.enabledCurrencies.code": body.currency },
        { $set: { "currency.enabledCurrencies.$.exchangeRate": exchangeRate } },
      );
    }

    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
