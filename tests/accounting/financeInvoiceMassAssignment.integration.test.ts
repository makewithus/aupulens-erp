import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const TEST_URI = "mongodb://127.0.0.1:27017/aupulens_test_finance_invoice_mass_assignment";
process.env.MONGODB_URI = TEST_URI;

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: () => authMock() }));

import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import JournalEntry from "@/models/finance/JournalEntry";
import ActivityLog from "@/models/admin/ActivityLog";

const TENANT_A = "aup-finance-invoice-tenant-a";
const TENANT_B = "aup-finance-invoice-tenant-b";
const USER_ID = new mongoose.Types.ObjectId().toString();
let patchInvoice: typeof import("@/app/api/finance/invoices/[id]/route").PATCH;

async function createInvoice(tenantId: string) {
  const customer = await Customer.create({
    tenantId,
    header: { name: "AUP Invoice Customer", is_company: true },
    createdBy: new mongoose.Types.ObjectId(USER_ID),
  });
  return Invoice.create({
    tenantId,
    partnerId: customer._id,
    createdBy: new mongoose.Types.ObjectId(USER_ID),
    invoiceDate: new Date("2026-01-01T00:00:00Z"),
    dueDate: new Date("2026-02-01T00:00:00Z"),
    amountTotal: 125,
    amountResidual: 125,
    state: "draft",
  });
}

function request(id: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/finance/invoices/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AUP-003: finance invoice persisted ownership and server-controlled financial fields", () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    expect(mongoose.connection.name).toMatch(/^aupulens_test_/);
    await Promise.all([Invoice.init(), Customer.init(), JournalEntry.init(), ActivityLog.init()]);
    patchInvoice = (await import("@/app/api/finance/invoices/[id]/route")).PATCH;
  });

  afterEach(async () => {
    await Promise.all([
      Invoice.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      Customer.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      ActivityLog.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
    ]);
    authMock.mockReset();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("rejects tenant transfer and direct posting/residual forgery without changing persisted state", async () => {
    const invoice = await createInvoice(TENANT_A);
    authMock.mockResolvedValue({ user: { id: USER_ID, name: "AUP QA", email: "aup-qa@example.invalid", tenantId: TENANT_A, role: "finance" } });

    const response = await patchInvoice(request(String(invoice._id), {
      tenantId: TENANT_B,
      state: "posted",
      amountResidual: 0,
      createdBy: new mongoose.Types.ObjectId().toString(),
    }), { params: Promise.resolve({ id: String(invoice._id) }) });

    expect(response.status).toBe(400);
    const persisted = await Invoice.findById(invoice._id).lean();
    expect(persisted?.tenantId).toBe(TENANT_A);
    expect(persisted?.state).toBe("draft");
    expect(persisted?.amountResidual).toBe(125);
  });

  it("does not read or modify an invoice belonging to another tenant", async () => {
    const invoice = await createInvoice(TENANT_B);
    authMock.mockResolvedValue({ user: { id: USER_ID, name: "AUP QA", email: "aup-qa@example.invalid", tenantId: TENANT_A, role: "finance" } });

    const response = await patchInvoice(request(String(invoice._id), {
      dueDate: "2026-03-01T00:00:00.000Z",
    }), { params: Promise.resolve({ id: String(invoice._id) }) });

    expect(response.status).toBe(404);
    const persisted = await Invoice.findById(invoice._id).lean();
    expect(persisted?.tenantId).toBe(TENANT_B);
    expect(persisted?.dueDate?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("does not allow the request to disable invoice approval and post a draft directly", async () => {
    const invoice = await createInvoice(TENANT_A);
    authMock.mockResolvedValue({ user: { id: USER_ID, tenantId: TENANT_A, role: "finance" } });
    const { PATCH: patchAccountingInvoice } = await import("@/app/api/accounting/invoices/[id]/route");
    const beforeEntries = await JournalEntry.countDocuments({ tenantId: TENANT_A });

    const response = await patchAccountingInvoice(
      new Request(`http://localhost/api/accounting/invoices/${invoice._id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "posted", approvalRequired: false }),
      }) as any,
      { params: Promise.resolve({ id: String(invoice._id) }) },
    );

    expect(response.status).toBe(400);
    expect((await Invoice.findById(invoice._id).lean())?.state).toBe("draft");
    expect(await JournalEntry.countDocuments({ tenantId: TENANT_A })).toBe(beforeEntries);
  });

  it("allows an authorized business-field update while retaining tenant ownership", async () => {
    const invoice = await createInvoice(TENANT_A);
    authMock.mockResolvedValue({ user: { id: USER_ID, name: "AUP QA", email: "aup-qa@example.invalid", tenantId: TENANT_A, role: "finance" } });

    const response = await patchInvoice(request(String(invoice._id), {
      dueDate: "2026-03-01T00:00:00.000Z",
    }), { params: Promise.resolve({ id: String(invoice._id) }) });

    expect(response.status).toBe(200);
    const persisted = await Invoice.findById(invoice._id).lean();
    expect(persisted?.tenantId).toBe(TENANT_A);
    expect(persisted?.dueDate?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});
