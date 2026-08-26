import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import JournalEntry from "@/models/JournalEntry";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(req.url);
    const reconciled = searchParams.get("reconciled");
    const pageParam = searchParams.get("page");

    await dbConnect();

    const query: any = { tenantId };

    // Bank reconciliation needs the full open-lines set to match against
    // statement lines, so pagination is opt-in via `page` — omitting it
    // preserves the original unbounded response exactly.
    if (!pageParam) {
      const entries = await JournalEntry.find(query)
        .sort({ "header.date": -1 })
        .populate("lineIds.accountId")
        .populate("lineIds.partnerId")
        .lean();

      const flattenedLines: any[] = [];
      entries.forEach((entry) => {
        entry.lineIds.forEach((line) => {
          if (reconciled === "false" && line.reconciled) return;

          flattenedLines.push({
            journalEntryId: entry._id,
            journalLineId: line._id,
            date: entry.header.date,
            entryName: entry.header.name,
            ref: entry.header.ref,
            accountId: line.accountId,
            partnerId: line.partnerId,
            label: line.label,
            debit: line.debit,
            credit: line.credit,
            reconciled: line.reconciled,
            status: entry.status,
          });
        });
      });

      return NextResponse.json({ items: flattenedLines });
    }

    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(pageParam) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const skip = (page - 1) * limit;

    const pipeline: any[] = [{ $match: query }, { $unwind: "$lineIds" }];

    if (reconciled === "false") {
      pipeline.push({ $match: { "lineIds.reconciled": { $ne: true } } });
    } else if (reconciled === "true") {
      pipeline.push({ $match: { "lineIds.reconciled": true } });
    }

    pipeline.push(
      { $lookup: { from: "accounts", localField: "lineIds.accountId", foreignField: "_id", as: "account" } },
      { $unwind: { path: "$account", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "customers", localField: "lineIds.partnerId", foreignField: "_id", as: "partner" } },
      { $unwind: { path: "$partner", preserveNullAndEmptyArrays: true } },
    );

    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      pipeline.push({
        $match: {
          $or: [
            { "header.name": re },
            { "header.ref": re },
            { "lineIds.label": re },
            { "account.name": re },
            { "partner.header.name": re },
            { "partner.name": re },
          ],
        },
      });
    }

    pipeline.push({ $sort: { "header.date": -1, _id: -1 } });

    const [result] = await JournalEntry.aggregate([
      ...pipeline,
      {
        $facet: {
          items: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                journalEntryId: "$_id",
                journalLineId: "$lineIds._id",
                date: "$header.date",
                entryName: "$header.name",
                ref: "$header.ref",
                accountId: { name: "$account.name", code: "$account.code" },
                partnerId: {
                  header: { name: "$partner.header.name" },
                  name: "$partner.name",
                },
                label: "$lineIds.label",
                debit: "$lineIds.debit",
                credit: "$lineIds.credit",
                reconciled: "$lineIds.reconciled",
                status: "$status",
              },
            },
          ],
          totals: [
            {
              $group: {
                _id: null,
                debit: { $sum: "$lineIds.debit" },
                credit: { $sum: "$lineIds.credit" },
              },
            },
          ],
          count: [{ $count: "total" }],
        },
      },
    ]);

    const items = result?.items || [];
    const totalsRow = result?.totals?.[0];
    const total = result?.count?.[0]?.total || 0;

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totals: { debit: totalsRow?.debit || 0, credit: totalsRow?.credit || 0 },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
