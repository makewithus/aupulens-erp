/**
 * AI-native action registry — validation, safety, and correctness.
 *
 * Every mutation the AI Command Center can perform goes through a two-phase
 * gate: buildPreview() (read-only, validates, NEVER mutates) → execute()
 * (mutates + audit log) only after a human confirm. These tests lock in the
 * validation edge cases and prove buildPreview never writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const chain = (result: any) => ({
    limit: () => ({ lean: () => Promise.resolve(result) }),
    lean: () => Promise.resolve(result),
  });
  return {
    chain,
    connectDB: vi.fn(),
    leadCreate: vi.fn(),
    leadFindOne: vi.fn(),
    taskCreate: vi.fn(),
    auditCreate: vi.fn(),
    customerFind: vi.fn(),
    customerFindOne: vi.fn(),
    customerCreate: vi.fn(),
    employeeCreate: vi.fn(),
    employeeCount: vi.fn(),
    accountFind: vi.fn(),
    accountFindOne: vi.fn(),
    accountCreate: vi.fn(),
    accountCount: vi.fn(),
    accountDelete: vi.fn(),
    jeCreate: vi.fn(),
    jeExists: vi.fn(),
    genInvoiceNumber: vi.fn(),
    invoiceSaved: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ default: h.connectDB }));
vi.mock("@/models/crm/Lead", () => ({ default: { create: h.leadCreate, findOne: h.leadFindOne } }));
vi.mock("@/models/crm/Task", () => ({ default: { create: h.taskCreate } }));
vi.mock("@/models/crm/CrmAuditLog", () => ({ default: { create: h.auditCreate } }));
vi.mock("@/models/sales/Customer", () => ({ default: { find: h.customerFind, findOne: h.customerFindOne, create: h.customerCreate } }));
vi.mock("@/models/hr/Employee", () => ({ default: { create: h.employeeCreate, countDocuments: h.employeeCount } }));
vi.mock("@/models/finance/Account", () => ({ default: { find: h.accountFind, findOne: h.accountFindOne, create: h.accountCreate, countDocuments: h.accountCount, deleteOne: h.accountDelete } }));
vi.mock("@/models/finance/JournalEntry", () => ({ default: { create: h.jeCreate, exists: h.jeExists } }));
vi.mock("@/lib/sales/invoiceNumbering", () => ({ generateInvoiceNumber: h.genInvoiceNumber }));
vi.mock("@/models/sales/SalesInvoice", () => ({
  SalesInvoice: class {
    _id = "inv-1";
    constructor(data: any) { Object.assign(this, data); }
    async save() { h.invoiceSaved(this); return this; }
  },
}));

import { COMMAND_ACTIONS, COMMAND_ACTION_TYPES, CommandActionError, isCommandAction, executeCommandBatch } from "@/lib/ai/commandActions";

const T = "tenant-1";
const U = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  h.connectDB.mockResolvedValue(undefined);
  h.auditCreate.mockResolvedValue({});
  h.leadCreate.mockResolvedValue({ _id: "lead-1" });
  h.customerCreate.mockResolvedValue({ _id: "cust-1" });
  h.employeeCreate.mockResolvedValue({ _id: "emp-1" });
  h.employeeCount.mockResolvedValue(0);
  h.accountCreate.mockResolvedValue({ _id: "acc-1" });
  h.accountCount.mockResolvedValue(0);
  h.accountDelete.mockResolvedValue({});
  h.jeCreate.mockResolvedValue({ _id: "je-1" });
  h.jeExists.mockResolvedValue(null);
  h.genInvoiceNumber.mockResolvedValue({ number: "INV-TEST-1", prefix: "INV-", seq: 1 });
});

describe("registry wiring", () => {
  it("registers every new action type", () => {
    for (const t of ["create_lead", "create_customer", "create_employee", "create_ledger", "delete_ledger", "create_invoice", "create_journal_entry"]) {
      expect(COMMAND_ACTION_TYPES).toContain(t);
      expect(isCommandAction(t)).toBe(true);
    }
    expect(isCommandAction("nonsense")).toBe(false);
  });
});

describe("create_lead", () => {
  it("requires a name", async () => {
    await expect(COMMAND_ACTIONS.create_lead.buildPreview({}, T)).rejects.toBeInstanceOf(CommandActionError);
  });
  it("previews without mutating", async () => {
    const { summary } = await COMMAND_ACTIONS.create_lead.buildPreview({ lead_name: "Acme", company_name: "Acme Inc" }, T);
    expect(summary).toContain("Acme");
    expect(h.leadCreate).not.toHaveBeenCalled();
  });
  it("executes with owner=user, status New, and audits", async () => {
    await COMMAND_ACTIONS.create_lead.execute({ lead_name: "Acme", email: "a@b.com" }, T, U);
    expect(h.leadCreate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: T, lead_name: "Acme", owner_id: U, createdBy: U, status: "New" }));
    expect(h.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ action: "created", record_type: "Lead" }));
  });
  it("falls back to a valid source when given an unknown one", async () => {
    await COMMAND_ACTIONS.create_lead.execute({ lead_name: "X", source: "TikTok Dance" }, T, U);
    expect(h.leadCreate).toHaveBeenCalledWith(expect.objectContaining({ source: "Manual Entry" }));
  });
});

describe("create_customer", () => {
  it("requires a name", async () => {
    await expect(COMMAND_ACTIONS.create_customer.buildPreview({}, T)).rejects.toBeInstanceOf(CommandActionError);
  });
  it("infers company when only a company name is given", async () => {
    await COMMAND_ACTIONS.create_customer.execute({ companyName: "Globex" }, T, U);
    expect(h.customerCreate).toHaveBeenCalledWith(expect.objectContaining({ header: expect.objectContaining({ name: "Globex", is_company: true }) }));
  });
  it("defaults currency to INR", async () => {
    await COMMAND_ACTIONS.create_customer.execute({ name: "Jane Doe", firstName: "Jane" }, T, U);
    expect(h.customerCreate).toHaveBeenCalledWith(expect.objectContaining({ currency: "INR" }));
  });
});

describe("create_employee", () => {
  it("requires first + last name", async () => {
    await expect(COMMAND_ACTIONS.create_employee.buildPreview({ firstName: "Sam" }, T)).rejects.toThrow(/last name/i);
  });
  it("requires email and phone", async () => {
    await expect(COMMAND_ACTIONS.create_employee.buildPreview({ firstName: "Sam", lastName: "Lee" }, T)).rejects.toThrow(/email/i);
    await expect(COMMAND_ACTIONS.create_employee.buildPreview({ firstName: "Sam", lastName: "Lee", email: "s@l.com" }, T)).rejects.toThrow(/phone/i);
  });
  it("auto-generates an employee code and defaults joining date", async () => {
    h.employeeCount.mockResolvedValue(4);
    await COMMAND_ACTIONS.create_employee.execute({ firstName: "Sam", lastName: "Lee", email: "s@l.com", phone: "999" }, T, U);
    expect(h.employeeCreate).toHaveBeenCalledWith(expect.objectContaining({ employeeCode: "EMP-0005", dateOfJoining: expect.any(Date) }));
  });
});

describe("create_ledger", () => {
  it("requires a name", async () => {
    await expect(COMMAND_ACTIONS.create_ledger.buildPreview({}, T)).rejects.toBeInstanceOf(CommandActionError);
  });
  it("maps a plain category to account_type + internal_group", async () => {
    const { preview } = await COMMAND_ACTIONS.create_ledger.buildPreview({ name: "Rent", type: "expense" }, T);
    expect(preview).toMatchObject({ account_type: "expense", internal_group: "expense" });
  });
  it("maps 'bank' to a cash asset and auto-numbers the code", async () => {
    h.accountCount.mockResolvedValue(2);
    await COMMAND_ACTIONS.create_ledger.execute({ name: "HDFC Current", type: "bank" }, T, U);
    expect(h.accountCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "HDFC Current", account_type: "asset_cash", internal_group: "asset", code: "1003" }));
  });
});

describe("delete_ledger (destructive, guarded)", () => {
  it("refuses when the ledger does not exist", async () => {
    h.accountFind.mockReturnValue(h.chain([]));
    await expect(COMMAND_ACTIONS.delete_ledger.buildPreview({ name: "Ghost" }, T)).rejects.toThrow(/No ledger/i);
  });
  it("refuses to delete a system-seeded ledger", async () => {
    h.accountFind.mockReturnValue(h.chain([{ _id: "a1", name: "Cash", isSystemSeeded: true }]));
    await expect(COMMAND_ACTIONS.delete_ledger.buildPreview({ name: "Cash" }, T)).rejects.toThrow(/system/i);
  });
  it("refuses to delete a ledger with posted transactions", async () => {
    h.accountFind.mockReturnValue(h.chain([{ _id: "a1", name: "Sales" }]));
    h.jeExists.mockResolvedValue({ _id: "je-x" });
    await expect(COMMAND_ACTIONS.delete_ledger.buildPreview({ name: "Sales" }, T)).rejects.toThrow(/posted transactions/i);
  });
  it("previews an empty, deletable ledger without deleting", async () => {
    h.accountFind.mockReturnValue(h.chain([{ _id: "a1", name: "Misc" }]));
    h.jeExists.mockResolvedValue(null);
    const { summary } = await COMMAND_ACTIONS.delete_ledger.buildPreview({ name: "Misc" }, T);
    expect(summary).toMatch(/PERMANENTLY DELETE/);
    expect(h.accountDelete).not.toHaveBeenCalled();
  });
});

describe("create_invoice", () => {
  it("requires a customer", async () => {
    await expect(COMMAND_ACTIONS.create_invoice.buildPreview({ lineItems: [{ name: "X", qty: 1, unitPrice: 100 }] }, T)).rejects.toThrow(/customer/i);
  });
  it("errors when the customer is not found", async () => {
    h.customerFind.mockReturnValue(h.chain([]));
    await expect(COMMAND_ACTIONS.create_invoice.buildPreview({ customerName: "Nobody", lineItems: [{ name: "X", qty: 1, unitPrice: 100 }] }, T)).rejects.toThrow(/No customer/i);
  });
  it("requires at least one line item", async () => {
    h.customerFind.mockReturnValue(h.chain([{ _id: "c1", header: { name: "Acme" } }]));
    await expect(COMMAND_ACTIONS.create_invoice.buildPreview({ customerName: "Acme", lineItems: [] }, T)).rejects.toThrow(/line item/i);
  });
  it("computes totals in preview and creates a DRAFT on execute", async () => {
    h.customerFind.mockReturnValue(h.chain([{ _id: "c1", header: { name: "Acme" } }]));
    const { preview } = await COMMAND_ACTIONS.create_invoice.buildPreview({ customerName: "Acme", lineItems: [{ name: "Widget", qty: 2, unitPrice: 100, taxRate: 18 }] }, T);
    // 2 * 100 = 200 taxable, +18% = 236 total
    expect(preview.taxableAmount).toBe(200);
    expect(preview.totalAmount).toBe(236);
    expect(h.invoiceSaved).not.toHaveBeenCalled();

    await COMMAND_ACTIONS.create_invoice.execute({ customerName: "Acme", lineItems: [{ name: "Widget", qty: 2, unitPrice: 100, taxRate: 18 }] }, T, U);
    const saved = h.invoiceSaved.mock.calls[0][0];
    expect(saved.status).toBe("draft");
    expect(saved.number).toBe("INV-TEST-1");
    expect(saved.totalAmount).toBe(236);
  });
});

describe("create_journal_entry", () => {
  const twoLines = [
    { account: "Rent Expense", debit: 5000, credit: 0 },
    { account: "Bank", debit: 0, credit: 5000 },
  ];
  const acc = (name: string) => ({ _id: `id-${name}`, name });

  function mockAccounts() {
    // resolveAccount uses Account.find(...).limit(2).lean() and expects exactly one match.
    h.accountFind.mockImplementation((q: any) => {
      const rx = q.$or?.[0]?.name || q.$or?.[0]?.accountName;
      const src = String(rx);
      const name = /Rent/.test(src) ? "Rent Expense" : /Bank/.test(src) ? "Bank" : null;
      return h.chain(name ? [acc(name)] : []);
    });
  }

  it("requires at least two lines", async () => {
    await expect(COMMAND_ACTIONS.create_journal_entry.buildPreview({ lines: [{ account: "Bank", debit: 100 }] }, T)).rejects.toThrow(/at least two/i);
  });
  it("rejects an unbalanced entry", async () => {
    mockAccounts();
    await expect(COMMAND_ACTIONS.create_journal_entry.buildPreview({ lines: [{ account: "Rent Expense", debit: 5000 }, { account: "Bank", credit: 4000 }] }, T)).rejects.toThrow(/not balanced/i);
  });
  it("rejects a line that is both debit and credit", async () => {
    mockAccounts();
    await expect(COMMAND_ACTIONS.create_journal_entry.buildPreview({ lines: [{ account: "Rent Expense", debit: 5000, credit: 5000 }, { account: "Bank", credit: 5000 }] }, T)).rejects.toThrow(/both a debit and a credit/i);
  });
  it("errors when a referenced ledger doesn't exist", async () => {
    h.accountFind.mockReturnValue(h.chain([]));
    await expect(COMMAND_ACTIONS.create_journal_entry.buildPreview({ lines: twoLines }, T)).rejects.toThrow(/No ledger/i);
  });
  it("previews a balanced entry and creates a DRAFT on execute", async () => {
    mockAccounts();
    const { preview } = await COMMAND_ACTIONS.create_journal_entry.buildPreview({ narration: "Rent paid", lines: twoLines }, T);
    expect(preview.totalDebit).toBe(5000);
    expect(preview.lines).toHaveLength(2);
    expect(h.jeCreate).not.toHaveBeenCalled();

    await COMMAND_ACTIONS.create_journal_entry.execute({ narration: "Rent paid", lines: twoLines }, T, U);
    expect(h.jeCreate).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: T,
      status: "draft",
      totals: expect.objectContaining({ amountTotal: 5000 }),
    }));
  });
});

describe("executeCommandBatch (multi-step, sequential)", () => {
  it("runs every step in order and reports full completion", async () => {
    const out = await executeCommandBatch(
      [
        { actionType: "create_lead", params: { lead_name: "Acme" } },
        { actionType: "create_customer", params: { name: "Acme Corp", companyName: "Acme Corp" } },
      ],
      T, U,
    );
    expect(out.failedIndex).toBeNull();
    expect(out.completed).toBe(2);
    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(h.leadCreate).toHaveBeenCalledTimes(1);
    expect(h.customerCreate).toHaveBeenCalledTimes(1);
  });

  it("stops at the first failing step and reports progress", async () => {
    const out = await executeCommandBatch(
      [
        { actionType: "create_lead", params: { lead_name: "Acme" } },
        { actionType: "create_lead", params: {} }, // missing name → execute throws
        { actionType: "create_customer", params: { name: "Later" } }, // must NOT run
      ],
      T, U,
    );
    expect(out.failedIndex).toBe(1);
    expect(out.completed).toBe(1);
    expect(out.results[0].ok).toBe(true);
    expect(out.results[1].ok).toBe(false);
    expect(h.customerCreate).not.toHaveBeenCalled();
  });

  it("rejects an unknown action type without executing anything", async () => {
    const out = await executeCommandBatch([{ actionType: "frobnicate", params: {} }], T, U);
    expect(out.failedIndex).toBe(0);
    expect(out.results[0].error).toMatch(/unknown action/i);
  });
});
