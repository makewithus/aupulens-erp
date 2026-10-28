import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import Asset from "@/models/finance/Asset";
import { buildPostedJournalReport } from "@/lib/accounting/reports";
import { syncAssetCapitalizationEntry } from "@/lib/accounting/assetPosting";
import { getBalanceSheetReviewItems } from "@/lib/accounting/balanceSheetReview";
import { dateInTimeZone, isValidDateOnly } from "@/lib/accounting/reportDate";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    if (date && !isValidDateOnly(date)) {
      return NextResponse.json({ error: "Invalid as-of date. Use YYYY-MM-DD." }, { status: 400 });
    }

    const cacheKey = `finance_bs:${tenantId}:${date || "today"}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectDB();
    // Backfill capitalization journals for running assets created before the
    // asset workflow began posting them. The ref is asset-specific, so this is
    // safe to repeat and existing entries are updated rather than duplicated.
    const runningAssets = await Asset.find({ tenantId, status: "running" }).lean();
    for (const asset of runningAssets) {
      await syncAssetCapitalizationEntry({ tenantId, asset });
    }
    const organization = await Organization.findOne({ subdomain: tenantId }).select("settings.timezone").lean();
    const configuredTimeZone = (organization as any)?.settings?.timezone || "UTC";
    let timeZone = configuredTimeZone;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    } catch {
      timeZone = "UTC";
    }
    const asOfDate = date || dateInTimeZone(new Date(), timeZone);

    const report = await buildPostedJournalReport({
      tenantId,
      endDate: new Date(`${asOfDate}T00:00:00.000Z`),
      endDateTimeZone: timeZone,
    });

    // This report reads every posted entry through the as-of date. Until the
    // source posts a closing journal, the cumulative unclosed P&L is the
    // retained-earnings balance needed to complete the Balance Sheet.
    const unclosedEarnings = report.income.total - report.expense.total;
    const equityAccounts = { ...report.equity.accounts };
    if (Math.abs(unclosedEarnings) > 0.01) {
      equityAccounts.current_year_earnings = {
        id: "current_year_earnings",
        code: "CYE",
        name: "Retained Earnings (derived from unclosed P&L)",
        accountType: "equity_unaffected",
        internalGroup: "equity",
        debit: unclosedEarnings < 0 ? Math.abs(unclosedEarnings) : 0,
        credit: unclosedEarnings > 0 ? unclosedEarnings : 0,
        amount: unclosedEarnings,
      };
    }

    const equityTotal = Object.values(equityAccounts).reduce(
      (sum, account) => sum + account.amount,
      0,
    );
    const reviewItems = getBalanceSheetReviewItems({
      asset: report.asset,
      liability: report.liability,
      equity: { accounts: equityAccounts },
    });

    const payload = {
      asset: report.asset,
      liability: report.liability,
      equity: {
        total: equityTotal,
        accounts: equityAccounts,
      },
      retainedEarnings: unclosedEarnings,
      reviewItems,
      asOfDate,
      timeZone,
      latestIncludedPostingDate: report.activity.latestPostedDate
        ? dateInTimeZone(report.activity.latestPostedDate, timeZone)
        : null,
      postedEntriesIncluded: report.activity.postedEntryCount,
      accountingBasis: "posted_journal_entries",
      validation: {
        totalDebits: report.totals.debit,
        totalCredits: report.totals.credit,
        trialBalanceBalanced: report.totals.balanced,
        accountReferencesComplete: report.activity.unclassifiedLineCount === 0,
        accountingEquationBalanced:
          Math.abs(report.asset.total - (report.liability.total + equityTotal)) <=
          0.01,
      },
      unclassifiedPostedLineCount: report.activity.unclassifiedLineCount,
    };

    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Balance Sheet Error:", error);
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}
