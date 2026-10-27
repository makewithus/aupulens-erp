import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
const actor = new mongoose.Types.ObjectId();
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: String(actor), role: "admin", tenantId: "remediation-a" } }) }));
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
vi.mock("@/lib/aiRuntime/runtime/safeEmit", () => ({ safeEmitEvent: vi.fn() }));
import User from "@/models/auth/User";
import Contract from "@/models/crm/Contract";
import Account from "@/models/finance/Account";
import Settings from "@/models/finance/AccountingSettings";
import Entry from "@/models/finance/JournalEntry";
import Payment from "@/models/sales/Payment";
import { POST as createPayment } from "@/app/api/sales/payments/route";
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { withAccountingTransaction, deferUntilAccountingCommit } from "@/lib/accounting/transaction";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import { PATCH as updateProfile } from "@/app/api/profile/route";
import { PUT as updateContract } from "@/app/api/crm/contracts/[id]/route";
import { PATCH as updateInvoice } from "@/app/api/sales/invoices/[id]/route";
let bank: any, revenue: any, customer: any;
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  for (const Model of [User, Contract, Account, Settings, Entry, Customer, SalesInvoice, Payment]) await Model.init();
  await ensureChartOfAccounts("remediation-a", String(actor));
  bank = await Account.findOne({ tenantId: "remediation-a", code: "1120" });
  revenue = await Account.findOne({ tenantId: "remediation-a", code: "4100" });
  await User.create({ _id: actor, tenantId: "remediation-a", name: "Owner", email: "owner@example.invalid", phone: "9999999999", password: "test-hash", role: "admin", department: "Finance", designation: "Manager" });
  customer = await Customer.create({ tenantId: "remediation-a", header: { name: "Customer" }, createdBy: actor });
});
beforeEach(async () => { vi.restoreAllMocks(); await Entry.deleteMany({}); await Settings.deleteMany({}); await Payment.deleteMany({}); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
const body = (data: any, path = "/api/profile") => new NextRequest(`http://localhost${path}`, { method: "PATCH", body: JSON.stringify(data) });
const posting = () => ({ tenantId: "remediation-a", createdBy: String(actor), voucherType: "journal" as const, header: { name: "REMEDIATION", journalType: "general" as const, date: new Date() }, lineIds: [{ accountId: bank._id, debit: 100, credit: 0 }, { accountId: revenue._id, debit: 0, credit: 100 }] });

describe("acceptance remediation with persisted boundaries", () => {
  it("persists preferences but denies self-service employment changes", async () => {
    const response = await updateProfile(body({ name: "Edited", department: "Attack", designation: "CEO", preferences: { theme: "light", language: "en-IN", role: "master-admin" } }));
    expect(response.status).toBe(200);
    const saved = await User.findById(actor).lean();
    expect(saved).toMatchObject({ name: "Edited", department: "Finance", designation: "Manager", role: "admin", preferences: { theme: "light", language: "en-IN" } });
    expect(saved?.preferences).not.toHaveProperty("role");
    expect((await updateProfile(body({ department: "Attack", designation: "CEO" }))).status).toBe(400);
  });
  it("blocks raw contract identity/audit fields and dotted tenant injection", async () => {
    const contract = await Contract.create({ tenantId: "remediation-a", contract_number: "CONTRACT-1", account_id: new mongoose.Types.ObjectId(), owner_id: actor, start_date: new Date(), end_date: new Date("2027-01-01"), createdBy: actor });
    const response = await updateContract(body({ notes: "Legitimate", tenantId: "foreign", "tenantId.x": "foreign", createdBy: new mongoose.Types.ObjectId(), approvalDetails: { approvedBy: actor }, $set: { tenantId: "foreign" } }), { params: Promise.resolve({ id: String(contract._id) }) });
    expect(response.status).toBe(200);
    const saved = await Contract.findById(contract._id).lean();
    expect(saved?.tenantId).toBe("remediation-a");
    expect(String(saved?.createdBy)).toBe(String(actor));
    expect(saved?.notes).toBe("Legitimate");
    await Contract.updateOne({ _id: contract._id }, { $set: { tenantId: "foreign" } });
    expect((await Contract.findById(contract._id))?.tenantId).toBe("remediation-a");
  });
  it("enforces configured approval for generated and direct posted journal writes", async () => {
    await Settings.create({ tenantId: "remediation-a", journals: { approvalsEnabled: true, approvalThresholdAmount: 50, approverRole: "admin" } });
    await expect(createPostedJournalEntry(posting())).rejects.toThrow("approval");
    await expect(Entry.create({ ...posting(), status: "posted", voucherStatus: "posted" })).rejects.toThrow("approval");
    expect(await Entry.countDocuments()).toBe(0);
  });
  it("rolls back writes and suppresses effects when work throws or returns an error", async () => {
    const effect = vi.fn(async () => {});
    await expect(withAccountingTransaction(async () => { await createPostedJournalEntry(posting()); deferUntilAccountingCommit(effect); throw new Error("Injected document failure"); })).rejects.toThrow("Injected document failure");
    expect(await Entry.countDocuments()).toBe(0);
    expect(effect).not.toHaveBeenCalled();
    const response = await withAccountingTransaction(async () => { await createPostedJournalEntry(posting()); return new Response("Rejected", { status: 400 }); });
    expect(response.status).toBe(400);
    expect(await Entry.countDocuments()).toBe(0);
    await withAccountingTransaction(async () => { await createPostedJournalEntry(posting()); deferUntilAccountingCommit(effect); });
    expect(await Entry.countDocuments()).toBe(1);
    expect(effect).toHaveBeenCalledTimes(1);
  });
  it("rolls back an actual invoice PATCH when its final document save fails after journal creation", async () => {
    const invoice = await SalesInvoice.create({ tenantId: "remediation-a", customerId: customer._id, number: "FAULT-1", status: "draft", createdBy: actor, invoiceDate: new Date(), lineItems: [{ name: "Service", qty: 1, unitPrice: 100, lineTotal: 100 }], taxableAmount: 100, totalAmount: 100 });
    const save = vi.spyOn(SalesInvoice.prototype, "save").mockImplementationOnce(async () => {
      expect(await Entry.countDocuments()).toBe(1);
      throw new Error("Injected invoice save failure");
    });
    const response = await updateInvoice(body({ status: "saved", lineItems: [{ name: "Service", qty: 1, unitPrice: 100, lineTotal: 100 }] }), { params: Promise.resolve({ id: String(invoice._id) }) });
    expect(save).toHaveBeenCalledTimes(1);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await Entry.countDocuments()).toBe(0);
    expect((await SalesInvoice.findById(invoice._id))?.status).toBe("draft");
  });
  it("rolls back the payment, journal and earlier invoice allocations when a later allocation fails", async () => {
    const invoices = [];
    for (const number of ["ALLOC-1", "ALLOC-2"]) invoices.push(await SalesInvoice.create({
      tenantId: "remediation-a", customerId: customer._id, number, status: "saved", createdBy: actor,
      invoiceDate: new Date(), lineItems: [{ name: "Service", qty: 1, unitPrice: 50, lineTotal: 50 }], taxableAmount: 50, totalAmount: 50,
    }));
    const originalSave = SalesInvoice.prototype.save;
    const save = vi.spyOn(SalesInvoice.prototype, "save").mockImplementation(async function (this: any, ...args: any[]) {
      if (String(this._id) === String(invoices[1]._id)) {
        expect(await Entry.countDocuments()).toBe(1);
        expect(await Payment.countDocuments()).toBe(1);
        throw new Error("Injected second allocation failure");
      }
      return originalSave.apply(this, args as any);
    });
    const response = await createPayment(body({ customerId: String(customer._id), amountReceived: 100,
      paymentNumber: "FAULT-PAYMENT", depositToAccountId: String(bank._id), status: "paid",
      allocations: invoices.map(invoice => ({ invoiceId: String(invoice._id), amount: 50 })),
    }, "/api/sales/payments"));
    expect(save).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(400);
    expect(await Entry.countDocuments()).toBe(0);
    expect(await Payment.countDocuments()).toBe(0);
    for (const invoice of invoices) {
      const saved = await SalesInvoice.findById(invoice._id);
      expect(saved?.payments).toHaveLength(0);
      expect(saved?.status).toBe("saved");
    }
  });

});
