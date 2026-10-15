import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMock } = vi.hoisted(() => ({ findMock: vi.fn() }));
vi.mock("@/models/finance/JournalEntry", () => ({ default: { find: findMock } }));

import { buildPostedJournalReport } from "@/lib/accounting/reports";

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
});
