import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_remediation_sys01";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import JournalEntry from "@/models/finance/JournalEntry";
import { invalidateServerCache } from "@/lib/api/serverCache";

const TENANT = "kk-metals-sys01";

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

let accountsGET: typeof import("@/app/api/accounting/accounts/route").GET;
let paymentPOST: typeof import("@/app/api/sales/payments/route").POST;

describe("SYS-01: Customer Payments & Deposit To Account Lookup", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Account.init();
    await AccountType.init();
    await Customer.init();
    await SalesInvoice.init();
    await Payment.init();
    await JournalEntry.init();

    ({ GET: accountsGET } = await import("@/app/api/accounting/accounts/route"));
    ({ POST: paymentPOST } = await import("@/app/api/sales/payments/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    invalidateServerCache();
    await Account.deleteMany({});
    await AccountType.deleteMany({});
    await Customer.deleteMany({});
    await SalesInvoice.deleteMany({});
    await Payment.deleteMany({});
    await JournalEntry.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("returns active Cash and Bank accounts in Deposit To account lookup (?type=bank)", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const userId = new mongoose.Types.ObjectId();

    // Create 1110 Main Cash and 1120 Bank Current Account
    await Account.create({
      tenantId: TENANT,
      code: "1110",
      name: "Main Cash",
      account_type: "asset_cash",
      internal_group: "asset",
      isSystemSeeded: true,
      isActive: true,
      createdBy: userId,
    });

    await Account.create({
      tenantId: TENANT,
      code: "1120",
      name: "Bank Current Account",
      account_type: "asset_cash",
      internal_group: "asset",
      isSystemSeeded: true,
      isActive: true,
      createdBy: userId,
    });

    // Inactive account should be excluded
    await Account.create({
      tenantId: TENANT,
      code: "1130",
      name: "Inactive Petty Cash",
      account_type: "asset_cash",
      internal_group: "asset",
      isActive: false,
      createdBy: userId,
    });

    // Cross-tenant account should be excluded
    await Account.create({
      tenantId: "other-tenant",
      code: "1110",
      name: "Other Tenant Cash",
      account_type: "asset_cash",
      internal_group: "asset",
      isActive: true,
      createdBy: userId,
    });

    const req = new NextRequest("http://localhost/api/accounting/accounts?type=bank");
    const res = await accountsGET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    const accountList = data.items || data;
    const codes = accountList.map((a: any) => a.code);
    expect(codes).toContain("1110");
    expect(codes).toContain("1120");
    expect(codes).not.toContain("1130");
    expect(accountList.every((a: any) => a.tenantId === TENANT || !a.tenantId || a.code !== "Other Tenant Cash")).toBe(true);
  });

  it("persists customer payment, updates invoice balance, and posts GL entry", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const userId = new mongoose.Types.ObjectId();

    const bankAcc = await Account.create({
      tenantId: TENANT,
      code: "1120",
      name: "Bank Current Account",
      account_type: "asset_cash",
      internal_group: "asset",
      isActive: true,
      createdBy: userId,
    });

    const arAcc = await Account.create({
      tenantId: TENANT,
      code: "1200",
      name: "Accounts Receivable",
      account_type: "asset_receivable",
      internal_group: "asset",
      isActive: true,
      createdBy: userId,
    });

    const customer = await Customer.create({
      tenantId: TENANT,
      header: { name: "KK Metals Customer" },
      createdBy: userId,
    });

    // Create posted invoice INV-0001: ₹5,000 taxable + ₹900 GST = ₹5,900 total
    const invoice = await SalesInvoice.create({
      tenantId: TENANT,
      number: "INV-0001",
      customerId: customer._id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 86400000 * 30),
      items: [
        {
          name: "Metal Sheets",
          qty: 5,
          unitPrice: 1000,
          discount: 0,
          discountMode: "percent",
          taxRate: 18,
          priceSubtotal: 5000,
        },
      ],
      taxableAmount: 5000,
      totalAmount: 5900,
      paidAmount: 0,
      status: "saved",
      createdBy: userId,
    });

    // Pay full ₹5,900 into 1120 Bank Current Account
    const paymentPayload = {
      customerId: customer._id.toString(),
      paymentDate: new Date().toISOString().split("T")[0],
      amountReceived: 5900,
      paymentMode: "bank_transfer",
      reference: "NEFT-KK-001",
      depositToAccountId: bankAcc._id.toString(),
      status: "paid",
      allocations: [
        {
          invoiceId: invoice._id.toString(),
          amount: 5900,
        },
      ],
    };

    const req = new NextRequest("http://localhost/api/sales/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paymentPayload),
    });

    const res = await paymentPOST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    const payment = body.data || body.payment;
    expect(payment).toBeDefined();
    expect(payment.depositToAccountId).toBe(bankAcc._id.toString());
    expect(payment.amountReceived).toBe(5900);

    // Verify invoice balance updated
    const updatedInvoice = await SalesInvoice.findById(invoice._id);
    const totalPaid = (updatedInvoice?.payments || []).reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
    expect(totalPaid).toBe(5900);
    expect(updatedInvoice?.status).toBe("paid");

    // Verify GL journal entry posted: Dr Cash/Bank ₹5,900, Cr AR ₹5,900
    const journal = payment.journalEntryIds?.length
      ? await JournalEntry.findById(payment.journalEntryIds[0])
      : await JournalEntry.findOne({
          tenantId: TENANT,
          sourceDocument: payment.paymentNumber,
        });
    expect(journal).toBeDefined();

    const lines = (journal as any)?.lines || journal?.lineIds || [];
    const debitLine = lines.find((l: any) => l.debit === 5900);
    const creditLine = lines.find((l: any) => l.credit === 5900);
    expect(debitLine?.accountId.toString()).toBe(bankAcc._id.toString());
    expect(creditLine?.accountId.toString()).toBe(arAcc._id.toString());
  });

  it("rejects payment if depositToAccountId belongs to another tenant or is inactive", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const userId = new mongoose.Types.ObjectId();

    const crossTenantAcc = await Account.create({
      tenantId: "foreign-tenant",
      code: "1120",
      name: "Foreign Bank",
      account_type: "asset_cash",
      isActive: true,
      createdBy: userId,
    });

    const customer = await Customer.create({
      tenantId: TENANT,
      header: { name: "Customer T1" },
      createdBy: userId,
    });

    const invoice = await SalesInvoice.create({
      tenantId: TENANT,
      number: "INV-0002",
      customerId: customer._id,
      invoiceDate: new Date(),
      taxableAmount: 1000,
      totalAmount: 1000,
      paidAmount: 0,
      status: "saved",
      createdBy: userId,
    });

    const req = new NextRequest("http://localhost/api/sales/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customer._id.toString(),
        paymentDate: new Date().toISOString().split("T")[0],
        amountReceived: 1000,
        depositToAccountId: crossTenantAcc._id.toString(),
        allocations: [{ invoiceId: invoice._id.toString(), amount: 1000 }],
      }),
    });

    const res = await paymentPOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/Selected Deposit To account is invalid/i);
  });
});
