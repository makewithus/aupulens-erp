import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
const commandAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: commandAuth }));
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SalesQuotation from "@/models/sales/SalesQuotation";
import SaleOrder from "@/models/sales/SaleOrder";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import Organization from "@/models/admin/Organization";
import { seedPlans } from "@/lib/platform/entitlements/planCatalog";
import { invalidateEntitlementsCache } from "@/lib/platform/entitlements/resolve";
import ChatHistory from "@/models/ai/ChatHistory";
import { executeErpQuery } from "@/lib/ai/erpQuery";
import { tryErpAssistant, safeErpError, formatErpResult } from "@/lib/ai/erpAssistant";
import { loadConversationContext } from "@/lib/ai/conversationContext";
import { prepareQuoteDraft, confirmQuoteDraft } from "@/lib/ai/quoteDraft";
import { parseErpIntent } from "@/lib/ai/erpIntent";

const tenantId = `qa-${randomUUID()}`;
const userId = new mongoose.Types.ObjectId().toString();
const base = { tenantId, userId, role: "admin", module: "sales" as const };
const now = new Date("2026-10-22T12:00:00+05:30");
let customer: any, product: any;
let conversationId: string;
const scope = () => ({ ...base, conversationId });
const ask = (text: string, requestId = randomUUID()) => tryErpAssistant({ ...scope(), text, requestId });
beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_erp_qa_${randomUUID().replaceAll("-", "")}`, { serverSelectionTimeoutMS: 3000 });
  await Promise.all([Customer.init(), Product.init(), SalesInvoice.init(), SalesQuotation.init(), SaleOrder.init(), ChatHistory.init(), AiCommandProposal.init()]);
  await seedPlans();
  await Organization.create({ name: "ERP QA", subdomain: tenantId, ownerUserId: userId, tier: "enterprise", subscriptionStatus: "active" });
  invalidateEntitlementsCache(tenantId);
  customer = await Customer.create({ tenantId, createdBy: userId, header: { name: "Rajesh Kumar", displayName: "Rajesh Kumar" } });
  const himalaya = await Customer.create({ tenantId, createdBy: userId, header: { name: "Himalaya Fitness Studio" } });
  const newgen = await Customer.create({ tenantId, createdBy: userId, header: { name: "NewGen Solutions Pvt. Ltd." } });
  await Customer.insertMany(Array.from({ length: 277 }, (_, i) => ({ tenantId, createdBy: userId, header: { name: `Fixture ${i}` } })));
  product = await Product.create({ tenantId, createdBy: userId, header: { name: "Ergonomic Office Chair", sale_ok: true }, tab_general_information: { type: "consu", list_price: 7499, gstRate: 0 } });
  const invoice = (number: string, amount: number, status: string, customerId = customer._id) => ({ tenantId, number, customerId, totalAmount: amount, taxableAmount: amount, status, invoiceDate: new Date("2026-09-26T00:00:00+05:30"), dueDate: new Date("2026-10-01"), payments: [], markedFullyPaid: status === "paid" });
  await SalesInvoice.insertMany([
    invoice("INV-0075", 29146, "overdue"), invoice("INV-0076", 29146, "saved"), invoice("INV-0050", 900, "partially_paid"),
    invoice("INV-0080", 979995, "paid", newgen._id),
    ...Array.from({ length: 6 }, (_, i) => invoice(`PAID-${i}`, 100, "paid", newgen._id)),
    ...Array.from({ length: 9 }, (_, i) => invoice(`DUE-${i}`, 100, "saved", newgen._id)),
    ...Array.from({ length: 293 }, (_, i) => invoice(`DRAFT-${i}`, 10000000, "draft")),
    invoice("VOID-1", 10000000, "cancelled"),
    { ...invoice("FUTURE-1", 200, "saved", newgen._id), dueDate: new Date("2099-01-01") },
    { ...invoice("PAID-STALE", 100, "saved", newgen._id), payments: [{ amount: 100, date: now, mode: "Cash" }] },
  ]);
  await SalesInvoice.create({ ...invoice("OTHER-TENANT", 99999999, "paid"), tenantId: "other-qa" });
  await SalesQuotation.insertMany(Array.from({ length: 19 }, (_, i) => ({ tenantId, quoteNumber: i < 3 ? ["QUO-000035", "QUO-000031", "QUO-000030"][i] : `QUO-FIXTURE-${i}`, customerId: i < 3 ? himalaya._id : customer._id, createdBy: userId, quoteDate: new Date(now.getTime() - i * 1000), lineItems: [] })));
  const linked = await SalesInvoice.create(invoice("INV-0086", 23026, "draft"));
  await SaleOrder.create({ tenantId, header: { name: "SO-000019", partnerId: customer._id }, salesOrderStatus: "confirmed", shipmentStatus: "not_shipped", salesInvoiceIds: [linked._id], totals: { amountTotal: 23026 } });
});
beforeEach(() => { conversationId = randomUUID(); });
afterAll(async () => { if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

describe("QA scenarios against disposable Mongo fixtures (not production baselines)", () => {
  it("1 prepares quote without saving, confirms once with replay safety", async () => {
    const before = await SalesQuotation.countDocuments({ tenantId });
    expect(before).toBe(19);
    expect((await ask("How many quotes do we have?"))?.message).toBe("19 quote records.");
    const draft = await ask("Create a quote for Himalaya Fitness Studio, 2 Ergonomic Office Chairs.");
    expect(draft?.message).toContain("₹14,998");
    expect(draft?.structured?.type).toBe("quote_proposal");
    if (draft?.structured?.type === "quote_proposal") {
      expect(draft.structured.customer).toBe("Himalaya Fitness Studio");
      expect(draft.structured.quantity).toBe(2);
      expect(draft.structured.formattedTotal).toBe("₹14,998");
    }
    expect(await SalesQuotation.countDocuments({ tenantId })).toBe(before);
    const first = await ask("confirm quote");
    expect(first?.message).toContain("Saved quote");
    expect(first?.structured?.type).toBe("quote_saved");
    expect((await ask("confirm quote"))?.message).toBe(first?.message);
    expect(await SalesQuotation.countDocuments({ tenantId })).toBe(before + 1);
  });
  it("2 explains individual invalid values", async () => {
    const result = await ask("make quantity 2.5, give 150% discount, quantity 0");
    expect(result?.message).toContain("Quantity 2.5 is valid"); expect(result?.message).toContain("150% discount is not allowed"); expect(result?.message).toContain("Quantity 0 is invalid");
  });
  it("6 actual plan is read from configured entitlements", async () => expect((await ask("Which plan does this account own?"))?.message).toContain("Account plan: enterprise"));
  it("3 specific unknown invoice", async () => {
    const res = await ask("What is the status of INV-9999?");
    expect(res?.message).toContain("INV-9999 was not found");
    expect(res?.structured?.type).toBe("not_found");
    if (res?.structured?.type === "not_found") {
      expect(res.structured.identifier).toBe("INV-9999");
    }
  });
  it("4 biggest eligible invoice is outside drafts and other tenants", async () => expect((await ask("What is our biggest invoice?"))?.message).toContain("INV-0080 — NewGen Solutions Pvt. Ltd. — ₹9,79,995"));
  it("5 overdue uses due date and outstanding balance", async () => expect((await executeErpQuery(base, parseErpIntent("How many invoices are overdue?"), now)).count).toBe(12));
  it("6 plan rejects roles without billing permission", async () => await expect(tryErpAssistant({ ...scope(), role: "sales", text: "which plan this account owns free or paid or ?" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" }));
  it("8 authoritative customer count", async () => {
    const res = await ask("How many customers do we have?");
    expect(res?.message).toBe("280 customer records.");
    expect(res?.structured?.type).toBe("count");
    if (res?.structured?.type === "count") {
      expect(res.structured.count).toBe(280);
      expect(res.structured.entity).toBe("customer");
    }
  });
  it("9 quote count is authoritative", async () => {
    const result = await executeErpQuery(base, { entity: "quote", operation: "count", customer: "Rajesh Kumar" });
    expect(result.count).toBe(16);
  });
  it("10 and 11 customer results and server-scoped total followup", async () => {
    const response = await ask("Show unpaid invoices for Rajesh Kumar");
    expect(response?.message).toContain("₹59,192");
    expect(response?.message).toContain("INV-0075");
    expect(response?.structured?.type).toBe("record_list");
    if (response?.structured?.type === "record_list") {
      expect(response.structured.records).toHaveLength(3);
      expect(response.structured.total?.formattedAmount).toBe("₹59,192");
      expect(response.structured.total?.count).toBe(3);
    }
    expect((await ask("what's the total?"))?.message).toContain("₹59,192");
    await expect(tryErpAssistant({ ...scope(), userId: new mongoose.Types.ObjectId().toString(), text: "what's the total?" })).rejects.toMatchObject({ code: "MISSING_CONTEXT" });
  });
  it("12 sales order uses real invoice and shipping fields", async () => {
    const response = await ask("What's the status of SO-000019?");
    expect(response?.message).toContain("confirmed"); expect(response?.message).toContain("INV-0086"); expect(response?.message).toContain("not_shipped"); expect(response?.message).toContain("₹23,026");
  });
  it("13 paid count is a database count", async () => expect((await ask("How many invoices are paid?"))?.message).toBe("7 paid invoice records."));
  it("14 quotes resolve the real customer", async () => { const res = await ask("Show quotes for Himalaya Fitness Studio"); for (const n of ["QUO-000035", "QUO-000031", "QUO-000030"]) expect(res?.message).toContain(n); });
  it("15 date-bounded issued revenue excludes draft/cancelled values", async () => {
    const res = await executeErpQuery(base, parseErpIntent("What was our revenue in the last 30 days?", now), now);
    expect(res.total).toBe(1040987); // 979995 + 59192 + 600 + 900 + 200 + 100
  });
  it("16 typos and Hinglish resolve through real customer search", async () => {
    for (const text of ["rajesh kumr pending paymnt", "Rajesh ka kitna payment pending hai?"]) expect((await ask(text))?.message).toContain("₹59,192");
    expect((await ask("hw many invocies r overdue"))?.message).toContain("12 overdue");
  });
  it("17 unknown customer and destructive request never mutate records", async () => {
    expect((await ask("Show me customer Tata Motors"))?.message).toContain("No matching records");
    expect((await ask("delete all draft invoices"))?.message).toContain("not supported");
    expect(await SalesInvoice.countDocuments({ tenantId, status: "draft" })).toBe(294);
  });
  it("cross-tenant reads and invalid operators are rejected", async () => {
    expect((await executeErpQuery(base, { entity: "invoice", operation: "lookup", identifier: "OTHER-TENANT" })).rows).toHaveLength(0);
    await expect(executeErpQuery({ ...base, role: "hr" }, { entity: "customer", operation: "count" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(executeErpQuery(base, { entity: "invoice", operation: "search", filter: { $where: "true" } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("confirmation is bound to owner and conversation and revalidates catalog price", async () => {
    const draft = await prepareQuoteDraft(scope(), "qoute for 2 ergonomic chiar to himalaya", randomUUID());
    await expect(confirmQuoteDraft({ ...scope(), userId: new mongoose.Types.ObjectId().toString() }, draft.proposalId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(confirmQuoteDraft({ ...scope(), conversationId: randomUUID() }, draft.proposalId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await Product.updateOne({ _id: product._id }, { $set: { "tab_general_information.list_price": 7500 } });
    await expect(confirmQuoteDraft(scope(), draft.proposalId)).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    await Product.updateOne({ _id: product._id }, { $set: { "tab_general_information.list_price": 7499 } });
  });
  it("concurrent confirmation creates one quote", async () => {
    const draft = await prepareQuoteDraft(scope(), "Create a quote for Himalaya Fitness Studio, 2 Ergonomic Office Chairs.", randomUUID());
    const results = await Promise.allSettled([confirmQuoteDraft(scope(), draft.proposalId), confirmQuoteDraft(scope(), draft.proposalId)]);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    expect(await SalesQuotation.countDocuments({ tenantId, sourceAiProposalId: draft.proposalId })).toBe(1);
  });
  it("rechecks module access when confirming a prepared draft", async () => {
    const draft = await prepareQuoteDraft(scope(), "Create a quote for Himalaya Fitness Studio, 2 Ergonomic Office Chairs.", randomUUID());
    await OrganizationEntitlement.create({ tenantId, planKey: "enterprise", overrides: { modules: ["admin"] } });
    invalidateEntitlementsCache(tenantId);
    try { await expect(confirmQuoteDraft(scope(), draft.proposalId)).rejects.toMatchObject({ code: "PERMISSION_DENIED" }); }
    finally { await OrganizationEntitlement.deleteOne({ tenantId }); invalidateEntitlementsCache(tenantId); }
    expect(await SalesQuotation.countDocuments({ tenantId, sourceAiProposalId: draft.proposalId })).toBe(0);
  });
  it("measures deterministic queries without provider credit entries", async () => {
    const ledger = mongoose.connection.collection("aicreditledgers");
    const before = await ledger.countDocuments({ tenantId });
    const started = performance.now();
    for (const text of ["How many customers do we have?", "What is our biggest invoice?", "Show unpaid invoices for Rajesh Kumar", "what's the total?"]) await ask(text);
    const delta = await ledger.countDocuments({ tenantId }) - before;
    console.info("[QA deterministic query measurement]", { requests: 4, wallMs: Math.round(performance.now() - started), providerLedgerEntriesDelta: delta });
    expect(delta).toBe(0);
  });
  it("native action confirmation enforces ownership, roles and concurrent replay protection", async () => {
    const { POST } = await import("@/app/api/ai/command/actions/[id]/confirm/route");
    const proposal = await AiCommandProposal.create({ tenantId, userId, module: "sales", actionType: "create_customer", params: { name: "Confirmed customer" }, expiresAt: new Date(Date.now() + 60000) });
    const params = { params: Promise.resolve({ id: String(proposal._id) }) };
    commandAuth.mockResolvedValue({ user: { ...base, id: new mongoose.Types.ObjectId().toString() } });
    expect((await POST({} as any, params)).status).toBe(404);
    commandAuth.mockResolvedValue({ user: { tenantId, id: userId, role: "hr" } });
    expect((await POST({} as any, params)).status).toBe(403);
    commandAuth.mockResolvedValue({ user: { tenantId, id: userId, role: "admin" } });
    const results = await Promise.all([POST({} as any, params), POST({} as any, params)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await Customer.countDocuments({ tenantId, "header.name": "Confirmed customer" })).toBe(1);
  });
  it("an unauthorized native batch never performs its earlier permitted step", async () => {
    const { POST } = await import("@/app/api/ai/command/actions/[id]/confirm/route");
    const proposal = await AiCommandProposal.create({ tenantId, userId, module: "batch", actionType: "batch", params: { steps: [{ actionType: "create_customer", params: { name: "Must not be created" } }, { actionType: "create_employee", params: { name: "Employee" } }] }, expiresAt: new Date(Date.now() + 60000) });
    commandAuth.mockResolvedValue({ user: { tenantId, id: userId, role: "sales" } });
    expect((await POST({} as any, { params: Promise.resolve({ id: String(proposal._id) }) })).status).toBe(403);
    expect(await Customer.countDocuments({ tenantId, "header.name": "Must not be created" })).toBe(0);
  });
  it("native invoice actions reject invalid lines rather than saving a partial invoice", async () => {
    const { COMMAND_ACTIONS } = await import("@/lib/ai/commandActions");
    const before = await SalesInvoice.countDocuments({ tenantId });
    await expect(COMMAND_ACTIONS.create_invoice.execute({ customerName: "Rajesh Kumar", lineItems: [{ name: "Valid", qty: 1, unitPrice: 100 }, { name: "Invalid", qty: 0, unitPrice: 100, discount: 150 }] }, tenantId, userId)).rejects.toThrow(/greater than zero|discount/i);
    expect(await SalesInvoice.countDocuments({ tenantId })).toBe(before);
  });
  it("database errors are safe and distinct from not found", () => {
    const error = safeErpError(new mongoose.Error("mongodb://secret"), "qa-request");
    expect(error.status).toBe(503); expect(JSON.stringify(error)).not.toContain("secret");
  });
  it("distinguishes total count from returned page size and isolates tenant counts", async () => {
    const totalCount = await Customer.countDocuments({ tenantId });
    const searchResult = await executeErpQuery(base, { entity: "customer", operation: "search" });
    expect(searchResult.rows.length).toBe(10);
    expect(searchResult.count).toBe(totalCount);
    expect(formatErpResult(searchResult)).toContain(`Showing 1–10 of ${totalCount}.`);

    const countResult = await executeErpQuery(base, { entity: "customer", operation: "count" });
    expect(countResult.rows).toHaveLength(0);
    expect(countResult.count).toBe(totalCount);

    const secondaryTenant = `secondary-qa-${randomUUID().slice(0, 6)}`;
    await Customer.insertMany(Array.from({ length: 5 }, (_, i) => ({ tenantId: secondaryTenant, createdBy: userId, header: { name: `Sec Customer ${i}` } })));
    const secondaryCount = await executeErpQuery({ ...base, tenantId: secondaryTenant }, { entity: "customer", operation: "count" });
    expect(secondaryCount.count).toBe(5);
    expect(formatErpResult(secondaryCount)).toBe("5 customer records.");
  });
  it("biggest invoice ignores drafts even with larger amounts, handles ties deterministically, and handles empty sets", async () => {
    const hugeDraft = await SalesInvoice.create({ tenantId, number: "INV-9999-DRAFT", totalAmount: 5000000, taxableAmount: 5000000, customerId: customer._id, status: "draft", invoiceDate: new Date("2026-10-01"), payments: [] });
    try {
      const res = await ask("What is our biggest invoice?");
      expect(res?.message).toContain("INV-0080");
      expect(res?.message).not.toContain("INV-9999-DRAFT");
    } finally {
      await SalesInvoice.deleteOne({ _id: hugeDraft._id });
    }

    const emptyTenant = `empty-qa-${randomUUID().slice(0, 6)}`;
    const emptyRes = await executeErpQuery({ ...base, tenantId: emptyTenant }, { entity: "invoice", operation: "search", status: "issued", sort: "amount_desc", limit: 1 });
    expect(emptyRes.rows).toHaveLength(0);
    expect(formatErpResult(emptyRes)).toContain("No matching records were found");
  });
  it("stale memory cannot override authoritative ERP queries and memory opt-out suppresses recall", async () => {
    const AiMemoryPreference = (await import("@/models/ai/AiMemoryPreference")).default;
    await AiMemoryPreference.updateOne({ tenantId, userId }, { $set: { enabled: false } }, { upsert: true });
    try {
      const context = await loadConversationContext({ tenantId, userId, role: "admin", module: "sales", conversationId: randomUUID(), message: "What did we decide about Orchid?" });
      expect(JSON.stringify(context.history)).not.toContain("APPROVED SAVED MEMORY:\n[{");
    } finally {
      await AiMemoryPreference.updateOne({ tenantId, userId }, { $set: { enabled: true } });
    }
  });
});
