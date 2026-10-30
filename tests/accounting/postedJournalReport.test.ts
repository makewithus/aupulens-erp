import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMock } = vi.hoisted(() => ({ findMock: vi.fn() }));
vi.mock("@/models/finance/JournalEntry", () => ({ default: { find: findMock } }));

import { buildPostedJournalReport, resolveAccountGroupAndType } from "@/lib/accounting/reports";

let entries: any[] = [];

describe("buildPostedJournalReport as-of filters", () => {
  beforeEach(() => {
    entries = [];
    findMock.mockReset();
    findMock.mockImplementation((query: any) => ({
      populate: () => ({
        lean: async () => entries.filter((entry) => {
          if (entry.tenantId !== query.tenantId || entry.status !== query.status) return false;
          const when = new Date(entry.header.date).getTime();
          if (query["header.date"]?.$lte && when > query["header.date"].$lte.getTime()) return false;
          if (query["header.date"]?.$gte && when < query["header.date"].$gte.getTime()) return false;
          return true;
        }),
      }),
    }));
  });

  it("uses the selected organization calendar date and excludes future and unposted entries", async () => {
    const account = { _id: "cash-id", code: "1000", name: "Cash and Bank", internal_group: "asset", account_type: "asset_cash" };
    entries = [
      { tenantId: "northstar", status: "posted", header: { date: new Date("2026-03-31T00:00:00.000Z") }, lineIds: [{ accountId: account, debit: 100, credit: 0 }] },
      { tenantId: "northstar", status: "posted", header: { date: new Date("2026-10-15T12:00:00.000Z") }, lineIds: [{ accountId: account, debit: 25, credit: 0 }] },
      { tenantId: "northstar", status: "draft", header: { date: new Date("2026-10-14T12:00:00.000Z") }, lineIds: [{ accountId: account, debit: 900, credit: 0 }] },
      { tenantId: "northstar", status: "posted", header: { date: new Date("2026-10-16T00:00:00.000Z") }, lineIds: [{ accountId: account, debit: 500, credit: 0 }] },
    ];

    const march = await buildPostedJournalReport({
      tenantId: "northstar",
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      endDateTimeZone: "Asia/Kolkata",
    });
    expect(march.asset.accounts["1000"].amount).toBe(100);
    expect(march.activity.postedEntryCount).toBe(1);
    expect(findMock.mock.calls[0][0].status).toBe("posted");
    expect(findMock.mock.calls[0][0]["header.date"].$lte.toISOString())
      .toBe("2026-03-31T18:29:59.999Z");

    const october = await buildPostedJournalReport({
      tenantId: "northstar",
      endDate: new Date("2026-10-15T00:00:00.000Z"),
      endDateTimeZone: "Asia/Kolkata",
    });
    expect(october.asset.accounts["1000"].amount).toBe(125);
    expect(october.activity.postedEntryCount).toBe(2);
    expect(october.activity.latestPostedDate?.toISOString()).toBe("2026-10-15T12:00:00.000Z");
    expect(findMock.mock.calls[1][0]["header.date"].$lte.toISOString())
      .toBe("2026-10-15T18:29:59.999Z");
  });

  it("keeps duplicate display codes separate and excludes cross-tenant account references", async () => {
    const sameCodeA = { _id: "cash-a", tenantId: "northstar", code: "1000", name: "Cash A", internal_group: "asset", account_type: "asset_cash" };
    const sameCodeB = { _id: "cash-b", tenantId: "northstar", accountCode: "1000", accountName: "Cash B", internal_group: "asset", account_type: "asset_cash" };
    const foreign = { _id: "foreign", tenantId: "another-tenant", code: "1001", name: "Foreign Cash", internal_group: "asset", account_type: "asset_cash" };
    entries = [{
      tenantId: "northstar",
      status: "posted",
      header: { date: new Date("2026-10-15T12:00:00.000Z") },
      lineIds: [
        { accountId: sameCodeA, debit: 40, credit: 0 },
        { accountId: sameCodeB, debit: 60, credit: 0 },
        { accountId: foreign, debit: 900, credit: 0 },
      ],
    }];

    const report = await buildPostedJournalReport({ tenantId: "northstar" });
    expect(Object.values(report.asset.accounts).map((account) => account.amount)).toEqual([40, 60]);
    expect(report.asset.total).toBe(100);
    expect(report.activity.unclassifiedLineCount).toBe(1);
    expect(report.totals.debit).toBe(1000);
  });
});

describe("legacy balance-sheet account classification", () => {
  it("keeps fixed assets out of equity when modern metadata conflicts", () => {
    expect(resolveAccountGroupAndType({
      code: "1500",
      name: "Plant & Machinery Equipment",
      internal_group: "equity",
      account_type: "equity",
    })).toMatchObject({ internalGroup: "asset", accountType: "asset_fixed" });
  });

  it("classifies inventory, bank and receivables as current assets", () => {
    expect(resolveAccountGroupAndType({ code: "1200", name: "Inventory Asset Stock", internal_group: "asset", account_type: "asset_receivable" }))
      .toMatchObject({ internalGroup: "asset", accountType: "asset_current" });
    expect(resolveAccountGroupAndType({ code: "1050", name: "HDFC Bank Corporate Current", internal_group: "equity", account_type: "equity" }))
      .toMatchObject({ internalGroup: "asset", accountType: "asset_cash" });
    expect(resolveAccountGroupAndType({ code: "1100", name: "Accounts Receivable", internal_group: "asset", account_type: "asset_cash" }))
      .toMatchObject({ internalGroup: "asset", accountType: "asset_receivable" });
  });
});
