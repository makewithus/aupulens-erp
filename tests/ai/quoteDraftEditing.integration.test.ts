import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import Organization from "@/models/admin/Organization";
import SalesQuotation from "@/models/sales/SalesQuotation";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import ChatHistory from "@/models/ai/ChatHistory";
import AiCreditLedger from "@/models/platform/AiCreditLedger";
import { seedPlans } from "@/lib/platform/entitlements/planCatalog";
import { tryErpAssistant } from "@/lib/ai/erpAssistant";
import { prepareQuoteDraft, updateQuoteDraft, confirmQuoteDraft } from "@/lib/ai/quoteDraft";
import { getAiCreditBalance } from "@/lib/platform/ai/credits";
import { getAiPeriod } from "@/lib/ai/usage";

const tenantId = `quote-edit-${randomUUID()}`;
const userId = new mongoose.Types.ObjectId().toString();
let product: any;
let scope: { tenantId: string; userId: string; role: string; conversationId: string };
const prompt = "Create a quote for Himalaya Fitness Studio, 2 Ergonomic Office Chairs.";
const ask = (text: string, requestId = randomUUID()) => tryErpAssistant({ ...scope, module: "sales", text, requestId });
beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_quote_edits_${randomUUID().replaceAll("-", "")}`);
  await Promise.all([Customer.init(), Product.init(), Organization.init(), SalesQuotation.init(), AiCommandProposal.init(), ChatHistory.init(), AiCreditLedger.init()]);
  await seedPlans();
  await Organization.create({ name: "Draft edit fixtures", subdomain: tenantId, ownerUserId: userId, tier: "enterprise", subscriptionStatus: "active" });
  await Organization.create({ name: "Other workspace", subdomain: "other", ownerUserId: userId, tier: "enterprise", subscriptionStatus: "active" });
  await Customer.create({ tenantId, createdBy: userId, header: { name: "Himalaya Fitness Studio" } });
  product = await Product.create({ tenantId, createdBy: userId, header: { name: "Ergonomic Office Chair", sale_ok: true }, tab_general_information: { type: "consu", list_price: 7499, gstRate: 0, allowFractional: true } });
});
beforeEach(() => { scope = { tenantId, userId, role: "admin", conversationId: randomUUID() }; });
afterAll(async () => { if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

describe("stored quote edits and free ERP accounting", () => {
  it("extracts a creation discount before catalog lookup and persists the calculated line only on confirmation", async () => {
    const before = await SalesQuotation.countDocuments({ tenantId });
    const draft = await ask("Create a quote for Himalaya Fitness Studio, 2 Ergonomic Office Chairs, with a 10% discount.");
    expect(draft?.message).toContain("Customer: Himalaya Fitness Studio");
    expect(draft?.message).toContain("Item: Ergonomic Office Chair");
    expect(draft?.message).toContain("Quantity: 2");
    expect(draft?.message).toContain("Discount: ₹1,499.8");
    expect(draft?.message).toContain("Total: ₹13,498.2");
    expect(await SalesQuotation.countDocuments({ tenantId })).toBe(before);
    await ask("confirm quote");
    const proposal: any = await AiCommandProposal.findOne({ tenantId, "params.conversationId": scope.conversationId }).lean();
    const quote = await SalesQuotation.findOne({ tenantId, sourceAiProposalId: proposal._id }).lean();
    expect(String(quote?.lineItems[0].itemId)).toBe(String(product._id));
    expect(quote?.lineItems[0]).toMatchObject({ qty: 2, discount: 10, discountMode: "percent" });
    expect(quote?.totalAmount).toBe(13498.2);
    expect(await SalesQuotation.countDocuments({ tenantId })).toBe(before + 1);
  });
  it.each([
    ["Create a quote for Himalaya Fitness Studio, 2 Ergonomic Office Chairs, with a 150% discount.", /150% discount.*100%/],
    ["Create a quote for Himalaya Fitness Studio, 0 Ergonomic Office Chairs, with a 10% discount.", /Quantity must be greater than zero/],
  ])("rejects invalid creation without a quote or confirmable proposal: %s", async (text, message) => {
    const quotesBefore = await SalesQuotation.countDocuments({ tenantId });
    const proposalsBefore = await AiCommandProposal.countDocuments({ tenantId });
    await expect(ask(text)).rejects.toMatchObject({ code: "BUSINESS_RULE", message: expect.stringMatching(message) });
    expect(await SalesQuotation.countDocuments({ tenantId })).toBe(quotesBefore);
    expect(await AiCommandProposal.countDocuments({ tenantId })).toBe(proposalsBefore);
    await expect(ask("confirm quote")).rejects.toMatchObject({ code: "MISSING_FIELD" });
  });
  it("supports fractional quantities with a creation discount for products allowing them", async () => {
    const draft = await ask("Create a quote for Himalaya Fitness Studio, 2.5 Ergonomic Office Chairs with a 10% discount.");
    expect(draft?.message).toContain("Quantity: 2.5");
    expect(draft?.message).toContain("Total: ₹16,872.75");
  });
  it("updates quantity and discount, recalculates preview, and confirms the same persisted line exactly once", async () => {
    const before = await SalesQuotation.countDocuments({ tenantId });
    await ask(prompt);
    const edited = await ask("make quantity 2.5");
    expect(edited?.message).toContain("Quantity: 2.5");
    expect(edited?.message).toContain("Total: ₹18,747.5");
    expect(edited?.actions).toEqual([{ label: "Confirm quote", value: "confirm quote" }]);
    const discounted = await ask("give 10% discount");
    expect(discounted?.message).toContain("Discount: ₹1,874.75");
    expect(discounted?.message).toContain("Total: ₹16,872.75");
    expect(await SalesQuotation.countDocuments({ tenantId })).toBe(before);
    const confirmed = await ask("confirm quote");
    expect(confirmed?.message).toContain("₹16,872.75");
    expect((await ask("confirm quote"))?.message).toBe(confirmed?.message);
    expect(await SalesQuotation.countDocuments({ tenantId })).toBe(before + 1);
    const proposal: any = await AiCommandProposal.findOne({ tenantId, "params.conversationId": scope.conversationId }).lean();
    const quote = await SalesQuotation.findOne({ tenantId, sourceAiProposalId: proposal._id }).lean();
    expect(quote?.lineItems[0]).toMatchObject({ qty: 2.5, discount: 10, discountMode: "percent" });
    expect(quote?.totalAmount).toBe(16872.75);
  });
  it.each(["quantity 0", "quantity -1", "quantity NaN", "quantity Infinity", "quantity 1e3", "quantity 2.5.6", "quantity 2.5 and quantity NaN", "quantity 2.5 and discount 1e3%", "give 150% discount", "discount -1%", "discount 10", "quantity 2.5, give 150% discount, quantity 0"])("rejects %s without any partial mutation", async text => {
    const draft = await prepareQuoteDraft(scope, prompt, randomUUID());
    const before = await AiCommandProposal.findById(draft.proposalId).lean();
    await expect(updateQuoteDraft(scope, draft.proposalId, text, randomUUID())).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    const after = await AiCommandProposal.findById(draft.proposalId).lean();
    expect(after?.params).toEqual(before?.params);
    expect(after?.summary).toBe(before?.summary);
    expect(await SalesQuotation.countDocuments({ tenantId, sourceAiProposalId: draft.proposalId })).toBe(0);
  });
  it("supports explicit quote edits and a combined valid change, including 100% discount", async () => {
    await ask(prompt);
    expect((await ask("change quote quantity to 2.5 and discount to 100%"))?.message).toContain("Total: ₹0");
    const confirmed = await ask("confirm quote");
    expect(confirmed?.message).toContain("₹0");
  });
  it("accepts sentence punctuation without truncating malformed numeric values", async () => {
    await ask(prompt);
    expect((await ask("make quantity 2.5."))?.message).toContain("Quantity: 2.5");
  });
  it("replayed edit requests do not reapply older quantities after later edits", async () => {
    await ask(prompt);
    const requestId = randomUUID();
    await ask("quantity 2.5", requestId);
    await ask("quantity 3");
    await ask("quantity 2.5", requestId);
    const proposal: any = await AiCommandProposal.findOne({ tenantId, "params.conversationId": scope.conversationId }).lean();
    expect(proposal.params.line.qty).toBe(3);
  });
  it("enforces tenant, owner, conversation and role boundaries", async () => {
    const draft = await prepareQuoteDraft(scope, prompt, randomUUID());
    for (const other of [{ ...scope, tenantId: "other" }, { ...scope, userId: new mongoose.Types.ObjectId().toString() }, { ...scope, conversationId: randomUUID() }]) {
      await expect(updateQuoteDraft(other, draft.proposalId, "quantity 2.5", randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(updateQuoteDraft({ ...scope, role: "hr" }, draft.proposalId, "quantity 2.5", randomUUID())).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
  it("rejects fractional edits for indivisible products and rechecks this on confirmation", async () => {
    const draft = await prepareQuoteDraft(scope, prompt, randomUUID());
    await updateQuoteDraft(scope, draft.proposalId, "quantity 2.5", randomUUID());
    await Product.updateOne({ _id: product._id }, { $set: { "tab_general_information.allowFractional": false } });
    try {
      await expect(updateQuoteDraft(scope, draft.proposalId, "quantity 3.5", randomUUID())).rejects.toMatchObject({ code: "BUSINESS_RULE" });
      await expect(confirmQuoteDraft(scope, draft.proposalId)).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    } finally { await Product.updateOne({ _id: product._id }, { $set: { "tab_general_information.allowFractional": true } }); }
  });
  it("rejects expired, cancelled and already executed drafts", async () => {
    for (const state of ["expired", "rejected", "executed"]) {
      const draft = await prepareQuoteDraft(scope, prompt, randomUUID());
      await AiCommandProposal.updateOne({ _id: draft.proposalId }, { $set: state === "expired" ? { expiresAt: new Date(0) } : { status: state } });
      await expect(updateQuoteDraft(scope, draft.proposalId, "quantity 2.5", randomUUID())).rejects.toMatchObject({ code: "CONFIRMATION_EXPIRED" });
    }
  });
  it("blocks edits once confirmation starts validating, rather than saving an older revision", async () => {
    const draft = await prepareQuoteDraft(scope, prompt, randomUUID());
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const original = Product.findOne.bind(Product);
    const spy = vi.spyOn(Product, "findOne").mockImplementationOnce(((...args: any[]) => {
      const query = original(...args as [any]);
      return { lean: async () => { enter(); await released; return query.lean(); } };
    }) as any);
    const confirmation = confirmQuoteDraft(scope, draft.proposalId);
    try {
      await entered;
      await expect(updateQuoteDraft(scope, draft.proposalId, "quantity 2.5", randomUUID())).rejects.toMatchObject({ code: "REQUEST_IN_PROGRESS" });
    } finally { release(); spy.mockRestore(); }
    expect((await confirmation).lineItems[0].qty).toBe(2);
  });
  it("labels successful ERP answers as zero credit and preserves real balances and ledger on success, retry and error", async () => {
    const before = await getAiCreditBalance(tenantId, getAiPeriod());
    const entries = await AiCreditLedger.countDocuments({ tenantId });
    const requestId = randomUUID();
    for (const result of [await ask("How many customers do we have?", requestId), await ask("How many customers do we have?", requestId)]) {
      expect(result?.message).toBe("1 customer record.");
      expect(result?.usage).toEqual({ creditsUsed: 0, source: "erp" });
    }
    const stored = await ChatHistory.findOne({ tenantId, conversationId: scope.conversationId }).lean();
    expect(stored?.messages.filter(m => m.role === "assistant")).toEqual([expect.objectContaining({ erpCreditsUsed: 0 })]);
    expect(stored?.messages.filter(m => m.role === "user")[0]).not.toHaveProperty("erpCreditsUsed");
    await ask(prompt);
    await expect(ask("quantity 0")).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    expect(await getAiCreditBalance(tenantId, getAiPeriod())).toEqual(before);
    expect(await AiCreditLedger.countDocuments({ tenantId })).toBe(entries);
  });
});
