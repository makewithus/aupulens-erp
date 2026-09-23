import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_all_exports";
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Customer from "@/models/sales/Customer";
import Subscription from "@/models/sales/Subscription";
import Payment from "@/models/sales/Payment";
import SaleOrder from "@/models/sales/SaleOrder";
import Account from "@/models/finance/Account";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAccount from "@/models/crm/Account";
import { mockSession } from "../accounting/_helpers/routeTestUtils";

const T = "t-all-exports";
const uid = new mongoose.Types.ObjectId();
const session = { user: { id: String(uid), tenantId: T, role: "admin" } } as any;

const post = (url: string, body: any) => new NextRequest(`http://x${url}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

async function sheet(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
  expect(res.headers.get("Content-Disposition")).toMatch(/\.xlsx"/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
  return wb.worksheets[0];
}

/** Presentation checks every export must satisfy. */
function expectPresentationReady(ws: ExcelJS.Worksheet, headers: string[]) {
  expect(String(ws.getCell("A1").value)).toMatch(/\w{4,}/); // title
  expect(ws.getCell("A1").font?.bold).toBe(true);
  const header = (ws.getRow(4).values as any[]).slice(1);
  for (const h of headers) expect(header).toContain(h); // proper column headings
  const c = ws.getRow(4).getCell(1);
  expect(c.font?.bold).toBe(true);
  expect((c.fill as any).fgColor.argb).toBe("FF1F3A5F");
  expect(c.border?.bottom?.style).toBe("thin");
  expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
  expect(ws.autoFilter).toBeTruthy();
  expect(ws.columns.every((col) => (col.width || 0) >= 10)).toBe(true);
}

describe("Sales / Finance / CRM Excel exports", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    vi.mocked(auth).mockResolvedValue(session);
    const cust: any = await Customer.create({ tenantId: T, header: { name: "Acme, Ltd", displayName: "Acme, Ltd", is_company: true }, contact_details: { email: "a@acme.com", phone: "9876543210" }, createdBy: uid } as any);
    await Subscription.create({
      tenantId: T, customerId: cust._id, profileName: "Gold", number: "SUB-1", billEvery: 1,
      lineItems: [{ name: "Plan", qty: 1, unitPrice: 999, lineTotal: 999 }], createdBy: uid,
    } as any);
    await Payment.create({ tenantId: T, customerId: cust._id, paymentNumber: "PAY-1", paymentDate: new Date("2026-08-05"), amountReceived: 12345.5, mode: "Cash", createdBy: uid } as any);
    await SaleOrder.create({
      tenantId: T, header: { name: "SO-1", partnerId: cust._id, dateOrder: new Date("2026-09-01") }, orderLines: [{ name: "W", productQty: 1, priceUnit: 1000, priceSubtotal: 1000 }],
      totals: { amountTotal: 1180 }, salesOrderStatus: "confirmed",
    } as any);
    await Account.create({ tenantId: T, code: "9001", name: "Sales, Domestic", account_type: "income", internal_group: "income", accountName: "Sales, Domestic", accountCode: "9001", isActive: true, createdBy: uid } as any);
    const cAcc: any = await CrmAccount.create({ tenantId: T, company_name: "BigCo", owner_id: uid, createdBy: uid } as any);
    await CrmOpportunity.create({ tenantId: T, deal_name: "Deal, One", account_id: cAcc._id, owner_id: uid, stage: "Discovery", amount: 250000, probability: 40, createdBy: uid } as any);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("Sales > Customers", async () => {
    const { POST } = await import("@/app/api/sales/customers/export/route");
    const ws = await sheet(await POST(post("/api/sales/customers/export", { format: "xlsx", includePII: true })));
    expectPresentationReady(ws, ["Display Name"]);
    const rows: any[][] = [];
    ws.eachRow((r, i) => i >= 5 && rows.push((r.values as any[]).slice(1)));
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("Acme, Ltd"); // comma stays inside one cell
  });

  it("legacy .xls request still returns a valid styled workbook", async () => {
    const { POST } = await import("@/app/api/sales/customers/export/route");
    const ws = await sheet(await POST(post("/api/sales/customers/export", { format: "xls" })));
    expectPresentationReady(ws, ["Display Name"]);
  });

  it("Sales > Subscriptions", async () => {
    const { POST } = await import("@/app/api/sales/subscriptions/export/route");
    const ws = await sheet(await POST(post("/api/sales/subscriptions/export", { format: "xlsx" })));
    expectPresentationReady(ws, ["Number", "Customer Name"]);
    const r5 = (ws.getRow(5).values as any[]).slice(1);
    expect(r5[0]).toBe("SUB-1");
    expect(r5[1]).toBe("Acme, Ltd");
  });

  it("Sales > Payments: typed date + currency amount", async () => {
    const { POST } = await import("@/app/api/sales/payments/export/route");
    const ws = await sheet(await POST(post("/api/sales/payments/export", { format: "xlsx" })));
    const headers = (ws.getRow(4).values as any[]).slice(1) as string[];
    expectPresentationReady(ws, headers.slice(0, 2));
    const dateIdx = headers.findIndex((h) => /date/i.test(h)) + 1;
    const amtIdx = headers.findIndex((h) => /amount/i.test(h)) + 1;
    const dateCell = ws.getRow(5).getCell(dateIdx);
    expect(dateCell.value).toBeInstanceOf(Date); // dd/mm/yyyy text converted to a real date
    expect(dateCell.numFmt).toBe("dd-mmm-yyyy");
    const amt = ws.getRow(5).getCell(amtIdx);
    expect(amt.value).toBe(12345.5);
    expect(amt.numFmt).toContain("₹");
    expect(amt.alignment?.horizontal).toBe("right");
  });

  it("Sales > Sales Orders: typed date + currency total", async () => {
    const { POST } = await import("@/app/api/sales/sales-orders/export/route");
    const ws = await sheet(await POST(post("/api/sales/sales-orders/export", { format: "xlsx" })));
    const headers = (ws.getRow(4).values as any[]).slice(1) as string[];
    expectPresentationReady(ws, headers.slice(0, 2));
    const row = (ws.getRow(5).values as any[]).slice(1);
    expect(row).toContain("SO-1");
    const dateCell = ws.getRow(5).getCell(headers.findIndex((h) => /date/i.test(h)) + 1);
    expect(dateCell.value).toBeInstanceOf(Date);
    const total = ws.getRow(5).getCell(headers.findIndex((h) => /amount|total/i.test(h)) + 1);
    expect(total.value).toBe(1180);
    expect(total.numFmt).toContain("₹");
  });

  it("Finance > Chart of Accounts", async () => {
    const { POST } = await import("@/app/api/finance/accounting/accounts/export/route");
    const ws = await sheet(await POST(post("/api/finance/accounting/accounts/export", { format: "xlsx", view: "all" })));
    expectPresentationReady(ws, ["Account Name", "Account Code", "Account Type", "Status"]);
    const row = (ws.getRow(5).values as any[]).slice(1);
    expect(row[0]).toBe("Sales, Domestic");
    expect(String(row[1])).toBe("9001"); // account codes stay text (no numeric coercion)
    expect(row[5]).toBe("Active");
  });

  it("CRM > Opportunities export (route)", async () => {
    expect(await CrmOpportunity.countDocuments({ tenantId: T })).toBe(1); // fixture really exists — no silent skip
    const { POST } = await import("@/app/api/crm/opportunities/export/route");
    const ws = await sheet(await POST(post("/api/crm/opportunities/export", { format: "xlsx" })));
    expectPresentationReady(ws, ["Deal Name", "Stage", "Amount"]);
    const headers = (ws.getRow(4).values as any[]).slice(1) as string[];
    const row = ws.getRow(5);
    expect(row.getCell(headers.indexOf("Deal Name") + 1).value).toBe("Deal, One");
    const amt = row.getCell(headers.indexOf("Amount") + 1);
    expect(amt.value).toBe(250000);
    expect(amt.numFmt).toContain("₹");
  });

  it("CRM bulk export engine (xlsx)", async () => {
    const { generateExportData } = await import("@/lib/crm/exportEngine");
    const buf: any = await generateExportData("Opportunities" as any, T, {}, "xlsx");
    expect(typeof buf).not.toBe("string");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf) as any);
    const ws = wb.worksheets[0];
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
    expect(ws.getCell("A1").font?.bold).toBe(true);
  });
});
