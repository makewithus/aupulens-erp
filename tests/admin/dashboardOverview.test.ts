import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { authMock, findMock, countMock, paymentCount, stockCount, businessHealthLean } = vi.hoisted(() => ({
  authMock: vi.fn(), findMock: vi.fn(), countMock: vi.fn(), paymentCount: vi.fn(), stockCount: vi.fn(), businessHealthLean: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/finance/JournalEntry", () => ({ default: { find: findMock } }));
vi.mock("@/models/sales/SalesInvoice", () => ({ SalesInvoice: { countDocuments: countMock } }));
vi.mock("@/models/sales/SaleOrder", () => ({ default: { countDocuments: countMock } }));
vi.mock("@/models/sales/Customer", () => ({ default: { countDocuments: countMock } }));
vi.mock("@/models/sales/Payment", () => ({ default: { countDocuments: paymentCount } }));
vi.mock("@/models/inventory/Product", () => ({ default: { countDocuments: countMock } }));
vi.mock("@/models/inventory/StockTransfer", () => ({ default: { countDocuments: countMock } }));
vi.mock("@/models/inventory/StockMove", () => ({ default: { countDocuments: countMock } }));
vi.mock("@/models/inventory/Stock", () => ({ default: { countDocuments: stockCount } }));
vi.mock("@/models/manufacturing/ManufacturingOrder", () => ({ default: { countDocuments: countMock } }));
vi.mock("@/models/auth/User", () => ({ default: { countDocuments: countMock } }));
vi.mock("@/models/admin/BusinessHealthSummary", () => ({ default: {
  findOne: () => ({ sort: () => ({ lean: businessHealthLean }) }),
} }));

import { GET } from "@/app/api/admin/dashboard/route";
import { invalidateServerCache } from "@/lib/api/serverCache";
import { DashboardCharts } from "@/components/admin/DashboardCharts";
import { NetProfitCard } from "@/components/admin/NetProfitCard";
import { DashboardMetrics } from "@/components/admin/DashboardMetrics";
import { hasBusinessHealthActivity } from "@/lib/admin/businessHealthActivity";

const account = (code: string, internal_group: string) => ({ _id: code, code, name: code, internal_group });
const line = (code: string, group: string, debit = 0, credit = 0) => ({ accountId: account(code, group), debit, credit });
const journal = (lineIds: any[], date = "2026-10-10T12:00:00Z", tenantId = "tenant-1", status = "posted") => ({
  tenantId, status, header: { date: new Date(date) }, lineIds,
});
let entries: any[];
const formatCurrency = (value: number) => `INR ${value}`;

beforeEach(() => {
  invalidateServerCache();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  entries = [];
  authMock.mockResolvedValue({ user: { role: "admin", tenantId: "tenant-1" } });
  countMock.mockResolvedValue(0);
  paymentCount.mockResolvedValue(2);
  stockCount.mockResolvedValue(3);
  businessHealthLean.mockResolvedValue(null);
  findMock.mockImplementation((query: any) => {
    const chain = {
      sort: () => chain,
      populate: () => chain,
      lean: async () => entries.filter((entry) => entry.tenantId === query.tenantId && entry.status === query.status
        && (!query["header.date"]?.$gte || entry.header.date >= query["header.date"].$gte)
        && (!query["header.date"]?.$lte || entry.header.date <= query["header.date"].$lte)),
    };
    return chain;
  });
});

afterEach(() => vi.useRealTimers());

async function summary() {
  invalidateServerCache();
  const response = await GET();
  expect(response.status).toBe(200);
  return (await response.json()).summary;
}

function profitMarkup(data: any) {
  return renderToStaticMarkup(createElement(NetProfitCard, { summary: data, formatCurrency }));
}

describe("System Overview accounting", () => {
  it("matches posted P&L including COGS, operating costs, refunds and tax exclusion", async () => {
    entries = [
      journal([line("bank", "asset", 1180), line("sales", "income", 0, 1000), line("gst", "liability", 0, 180)]),
      journal([line("cogs", "expense", 400), line("stock", "asset", 0, 400)]),
      journal([line("rent", "expense", 200), line("bank", "asset", 0, 200)]),
      journal([line("sales", "income", 100), line("bank", "asset", 0, 100)]),
      journal([line("bank", "asset", 50), line("rent", "expense", 0, 50)]),
      journal([line("sales", "income", 0, 99999)], undefined, "other-tenant"),
      journal([line("rent", "expense", 99999)], undefined, "tenant-1", "draft"),
    ];
    const data = await summary();
    expect(data.finance).toMatchObject({ totalRevenue: 900, totalExpenses: 550, netIncome: 350,
      revenueCurrentMonth: 900, expensesCurrentMonth: 550, totalTransactions: 5, totalPayments: 2,
      profitAvailable: true, accountingBasis: "posted_journal_entries" });
    expect(data.chartData.at(-1)).toMatchObject({ month: "Oct", revenue: 900 });
    expect(profitMarkup(data)).toContain("38.9% profit margin");
    expect(paymentCount).toHaveBeenCalledWith({ tenantId: "tenant-1", status: "paid" });
    expect(stockCount).toHaveBeenCalledWith({ tenantId: "tenant-1", isReserved: { $ne: true } });
    expect(data.inventory.totalStockTransfers).toBe(3);
  });

  it("marks revenue without posted costs incomplete instead of claiming profit", async () => {
    entries = [journal([line("bank", "asset", 9319640), line("sales", "income", 0, 9319640)])];
    const data = await summary();
    expect(data.finance).toMatchObject({ totalRevenue: 9319640, totalExpenses: 0, netIncome: null, profitAvailable: false });
    const html = profitMarkup(data);
    expect(html).toContain("Review ledger");
    expect(html).not.toContain("profit margin");
    expect(html).toContain("Cost of goods sold and operating expenses have not been posted");
    const metrics = renderToStaticMarkup(createElement(DashboardMetrics, { summary: data, formatCurrency, enabledModules: ["finance"] }));
    expect(metrics).toContain("Review ledger");
    const charts = renderToStaticMarkup(createElement(DashboardCharts, { summary: data, formatCurrency, enabledModules: ["finance"] }));
    expect(charts).not.toContain("100.0%");
    expect(charts).toContain("Review ledger");
  });

  it("uses accounting dates for monthly totals and excludes other months", async () => {
    entries = [
      journal([line("bank", "asset", 100), line("sales", "income", 0, 100)], "2026-09-10T12:00:00Z"),
      journal([line("bank", "asset", 150), line("sales", "income", 0, 150)]),
      journal([line("rent", "expense", 25), line("bank", "asset", 0, 25)]),
    ];
    const data = await summary();
    expect(data.finance).toMatchObject({ totalRevenue: 250, revenueCurrentMonth: 150, revenueChange: 50,
      totalExpenses: 25, expensesCurrentMonth: 25, netIncome: 225 });
    expect(data.chartData.slice(-2).map((row: any) => row.revenue)).toEqual([100, 150]);
  });

  it("shows a loss, reports empty ledgers as zero, and flags unbalanced ledgers", async () => {
    entries = [journal([line("rent", "expense", 250), line("bank", "asset", 0, 250)])];
    let data = await summary();
    expect(data.finance.netIncome).toBe(-250);
    expect(profitMarkup(data)).toContain("Loss");
    entries[0].lineIds.pop();
    data = await summary();
    expect(data.finance.netIncome).toBeNull();
    expect(data.finance.profitUnavailableReason).toContain("out of balance");
    entries = [];
    data = await summary();
    expect(data.finance.netIncome).toBe(0);
    expect(data.finance.profitAvailable).toBe(true);
    expect(profitMarkup(data)).toContain("No accounting entries have been posted yet.");
    expect(profitMarkup(data)).not.toContain("Unavailable");
    expect(profitMarkup(data)).not.toContain("profit margin");
  });

  it("rejects unauthenticated and non-admin requests before querying data", async () => {
    for (const session of [null, { user: { role: "sales", tenantId: "tenant-1" } }]) {
      authMock.mockResolvedValue(session);
      expect((await GET()).status).toBe(401);
    }
    expect(findMock).not.toHaveBeenCalled();
  });

  it("recognizes cost-only and negative-revenue activity for health summaries", () => {
    expect(hasBusinessHealthActivity({ finance: { totalExpenses: 200 } })).toBe(true);
    expect(hasBusinessHealthActivity({ finance: { totalRevenue: -200 } })).toBe(true);
    expect(hasBusinessHealthActivity({ finance: { totalRevenue: 0, totalTransactions: 0 } })).toBe(false);
    expect(hasBusinessHealthActivity(null)).toBe(false);
  });
});
