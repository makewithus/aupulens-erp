import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_remediation_bills";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Account from "@/models/finance/Account";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import JournalEntry from "@/models/finance/JournalEntry";
import { DOCUMENT_STATUS, PAYMENT_STATE } from "@/lib/constants/statuses";
import { invalidateServerCache } from "@/lib/api/serverCache";

const TENANT = "kk-metals-bills";

function mockSession(tenantId: string, role = "admin") {
  return {
    user: {
      id: new mongoose.Types.ObjectId().toString(),
      email: "rajesh@gmail.com",
      name: "Rajesh",
      role,
      tenantId,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

let billsGET: typeof import("@/app/api/finance/bills/route").GET;
let billsPOST: typeof import("@/app/api/finance/bills/route").POST;
let billIdPATCH: typeof import("@/app/api/finance/bills/[id]/route").PATCH;

describe("SYS-18, SYS-16, SYS-15: Supplier Bills Integrity & Workflow", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Account.init();
    await Customer.init();
    await Invoice.init();
    await JournalEntry.init();

    ({ GET: billsGET, POST: billsPOST } = await import("@/app/api/finance/bills/route"));
    ({ PATCH: billIdPATCH } = await import("@/app/api/finance/bills/[id]/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    invalidateServerCache();
    await Account.deleteMany({});
    await Customer.deleteMany({});
    await Invoice.deleteMany({});
    await JournalEntry.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("SYS-18: Defaults payableAccountId to the organization's AP control account (2100) when omitted", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Seed 2100 Accounts Payable control account
    const apAccount = await Account.create({
      tenantId: TENANT,
      code: "2100",
      name: "Accounts Payable",
      account_type: "liability_payable",
      internal_group: "liability",
      isActive: true,
      createdBy: userId,
    });

    const supplier = await Customer.create({
      tenantId: TENANT,
      header: { name: "Raw Materials Vendor" },
      isSupplier: true,
      createdBy: userId,
    });

    // Create bill WITHOUT payableAccountId
    const billPayload = {
      partnerId: supplier._id.toString(),
      billDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 86400000 * 30).toISOString().split("T")[0],
      billLines: [
        {
          name: "Steel Rods",
          quantity: 10,
          priceUnit: 500,
          priceSubtotal: 5000,
        },
      ],
      amountTotal: 5000,
      state: DOCUMENT_STATUS.DRAFT,
    };

    const req = new NextRequest("http://localhost/api/finance/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(billPayload),
    });

    const res = await billsPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    const item = data.item || data;
    expect(item.payableAccountId?.toString()).toBe(apAccount._id.toString());
  });

  it("SYS-18: Chooses an active payable-type account, not an unrelated liability that happens to use code 2100", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);
    await Account.create({
      tenantId: TENANT,
      code: "2100",
      name: "Other Current Liability",
      account_type: "liability_current",
      internal_group: "liability",
      isActive: true,
      createdBy: userId,
    });
    const payable = await Account.create({
      tenantId: TENANT,
      code: "2110",
      name: "Trade Payables",
      account_type: "liability_payable",
      internal_group: "liability",
      isActive: true,
      createdBy: userId,
    });
    const supplier = await Customer.create({
      tenantId: TENANT,
      header: { name: "Typed AP Supplier" },
      isSupplier: true,
      createdBy: userId,
    });

    const req = new NextRequest("http://localhost/api/finance/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnerId: supplier._id.toString(),
        invoiceLines: [{ name: "Materials", quantity: 1, priceUnit: 100, priceSubtotal: 100 }],
        amountTotal: 100,
      }),
    });
    const res = await billsPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    const bill = data.item || data;
    expect(bill.payableAccountId?.toString()).toBe(payable._id.toString());
  });

  it("SYS-16: Creating a bill directly in pending_approval state works without requiring an existing ID", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    await Account.create({
      tenantId: TENANT,
      code: "2100",
      name: "Accounts Payable",
      account_type: "liability_payable",
      internal_group: "liability",
      isActive: true,
      createdBy: userId,
    });

    const supplier = await Customer.create({
      tenantId: TENANT,
      header: { name: "Direct Submit Vendor" },
      isSupplier: true,
      createdBy: userId,
    });

    // Client submitting directly for approval on new bill
    const billPayload = {
      partnerId: supplier._id.toString(),
      billDate: new Date().toISOString().split("T")[0],
      billLines: [
        {
          name: "Industrial Screws",
          quantity: 100,
          priceUnit: 10,
          priceSubtotal: 1000,
        },
      ],
      amountTotal: 1000,
      state: DOCUMENT_STATUS.PENDING_APPROVAL,
    };

    const req = new NextRequest("http://localhost/api/finance/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(billPayload),
    });

    const res = await billsPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    const item = data.item || data;
    expect(item._id).toBeDefined();
    expect(item.state).toBe(DOCUMENT_STATUS.PENDING_APPROVAL);
  });

  it("SYS-15: Unposted bills are NOT counted in totalPayable summaries and do not post GL until posted", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    const apAcc = await Account.create({
      tenantId: TENANT,
      code: "2100",
      name: "Accounts Payable",
      account_type: "liability_payable",
      internal_group: "liability",
      isActive: true,
      createdBy: userId,
    });

    const expAcc = await Account.create({
      tenantId: TENANT,
      code: "5000",
      name: "Raw Materials Expense",
      account_type: "expense",
      internal_group: "expense",
      isActive: true,
      createdBy: userId,
    });

    const supplier = await Customer.create({
      tenantId: TENANT,
      header: { name: "Pending Vendor" },
      isSupplier: true,
      createdBy: userId,
    });

    // 1. Create a bill in pending_approval state (₹10,000)
    const bill = await Invoice.create({
      tenantId: TENANT,
      moveType: "in_invoice",
      name: "BILL-2026-0001",
      partnerId: supplier._id,
      invoiceDate: new Date(),
      state: DOCUMENT_STATUS.PENDING_APPROVAL,
      paymentState: PAYMENT_STATE.NOT_PAID,
      payableAccountId: apAcc._id,
      amountTotal: 10000,
      amountUntaxed: 10000,
      totals: { amountUntaxed: 10000, amountTax: 0, amountTotal: 10000 },
      invoiceLines: [
        {
          name: "Copper Ingots",
          quantity: 1,
          priceUnit: 10000,
          priceSubtotal: 10000,
          accountId: expAcc._id,
        },
      ],
      createdBy: userId,
    });

    // 2. Fetch bills stats: totalPayable MUST be 0 because bill is NOT posted!
    const req1 = new NextRequest("http://localhost/api/finance/bills");
    const res1 = await billsGET(req1);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.stats.totalPayable).toBe(0);
    expect(data1.stats.pendingCount).toBe(1);

    // 3. Verify no GL journal entry exists yet
    const journals1 = await JournalEntry.find({ tenantId: TENANT, "header.ref": bill.name });
    expect(journals1.length).toBe(0);

    // 4. Invalidate cache before patch & fetch
    invalidateServerCache();

    // 5. Now transition bill through workflow: APPROVED then POSTED
    const approveReq = new NextRequest(`http://localhost/api/finance/bills/${bill._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: DOCUMENT_STATUS.APPROVED }),
    });
    const approveRes = await billIdPATCH(approveReq, { params: Promise.resolve({ id: bill._id.toString() }) });
    expect(approveRes.status).toBe(200);

    invalidateServerCache();

    const patchReq = new NextRequest(`http://localhost/api/finance/bills/${bill._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: DOCUMENT_STATUS.POSTED }),
    });
    const patchRes = await billIdPATCH(patchReq, { params: Promise.resolve({ id: bill._id.toString() }) });
    expect(patchRes.status).toBe(200);

    // 6. Invalidate cache before fetching updated stats
    invalidateServerCache();

    // 7. Fetch bills stats again: totalPayable MUST now be 10,000!
    const req2 = new NextRequest("http://localhost/api/finance/bills");
    const res2 = await billsGET(req2);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.stats.totalPayable).toBe(10000);
    expect(data2.items[0].state).toBe(DOCUMENT_STATUS.POSTED);

    // 8. Verify GL journal entry now exists
    const journals2 = await JournalEntry.find({ tenantId: TENANT, "header.ref": bill.name });
    expect(journals2.length).toBe(1);
    expect(journals2[0].status).toBe(DOCUMENT_STATUS.POSTED);
  });
});
