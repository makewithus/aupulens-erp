import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/aupulens_test_regional_command_automation";

const { mockAuth, mockAzure, mockRecordAiUsage, mockRecordSarvamUsage } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockAzure: vi.fn(),
  mockRecordAiUsage: vi.fn(async () => undefined),
  mockRecordSarvamUsage: vi.fn(async () => undefined),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/ai/claude", () => ({
  callClaudeWithUsage: mockAzure,
  callClaudeWithHistoryAndUsage: mockAzure,
  callClaudeStreamWithUsage: vi.fn(),
  CLAUDE_DEFAULT_MODEL: "azure-test-deployment",
  CLAUDE_DEFAULT_MAX_TOKENS: 1000,
}));
vi.mock("@/lib/ai/usage", () => ({
  getAiPeriod: () => "2026-09",
  getAiUsageCount: vi.fn(async () => 0),
  incrementAiUsage: vi.fn(async () => undefined),
  getGlobalMonthlyCap: () => 1_000_000,
  getGlobalAiUsageCount: vi.fn(async () => 0),
  incrementGlobalAiUsage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/platform/ai/instrumentation", () => ({
  recordAiUsage: mockRecordAiUsage,
  recordSarvamUsage: mockRecordSarvamUsage,
}));
vi.mock("@/lib/platform/ai/limitBehavior", () => ({
  resolveAtLimitDecision: vi.fn(async () => ({ action: "block" })),
  checkAiUsageThresholdCrossing: vi.fn(async () => undefined),
}));
vi.mock("@/lib/platform/ai/spend", () => ({ costCapReached: vi.fn(async () => false) }));

import Organization from "@/models/admin/Organization";
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import Counter from "@/models/shared/Counter";
import { AI_ACTION_STATUS, LANGUAGE_CODE } from "@/lib/constants/statuses";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { clearLanguageCache } from "@/lib/ai/language/pipeline";
import { clearReplyCache } from "@/lib/ai/language/respond";
import { fakeClient, setSarvamEnv } from "./helpers";

const tenantId = "regional-ai";
const userId = new mongoose.Types.ObjectId();
const invoiceClassifierJson = JSON.stringify({
  intent: "action",
  actionType: "create_invoice",
  actionParams: {
    customerName: "Acme Traders",
    lineItems: [{ name: "service", qty: 2, unitPrice: 1000, taxRate: 18 }],
    notes: "regional command automation test",
  },
});

function req(command: string) {
  return new Request("http://localhost/api/ai/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, context: { pathname: "/sales/invoices" } }),
  }) as any;
}

function confirmReq() {
  return new Request("http://localhost/api/ai/command/actions/confirm", { method: "POST" }) as any;
}

function translatedInvoiceCommand(input: string) {
  const entity = input.match(/\b(?:ZXQ\d+ZXQ|Ent\d+)\b/)?.[0] || "Acme Traders";
  return `create invoice for ${entity} with item service qty 2 unit price 1000 GST 18`;
}

const regionalInvoiceCommands = [
  [LANGUAGE_CODE.HINDI, "कृपया Acme Traders के लिए service 2 qty 1000 price 18 GST वाला invoice बनाओ"],
  [LANGUAGE_CODE.BENGALI, "Acme Traders এর জন্য service 2 qty 1000 price 18 GST দিয়ে invoice তৈরি করুন"],
  [LANGUAGE_CODE.GUJARATI, "Acme Traders માટે service 2 qty 1000 price 18 GST સાથે invoice બનાવો"],
  [LANGUAGE_CODE.KANNADA, "Acme Traders ಗಾಗಿ service 2 qty 1000 price 18 GST invoice ರಚಿಸಿ"],
  [LANGUAGE_CODE.MALAYALAM, "Acme Traders വേണ്ടി service 2 qty 1000 price 18 GST invoice ഉണ്ടാക്കുക"],
  [LANGUAGE_CODE.MARATHI, "कृपया Acme Traders साठी service 2 qty 1000 price 18 GST चे invoice तयार करा"],
  [LANGUAGE_CODE.ODIA, "Acme Traders ପାଇଁ service 2 qty 1000 price 18 GST invoice ତିଆରି କରନ୍ତୁ"],
  [LANGUAGE_CODE.PUNJABI, "Acme Traders ਲਈ service 2 qty 1000 price 18 GST invoice ਬਣਾਓ"],
  [LANGUAGE_CODE.TAMIL, "Acme Traders க்கு service 2 qty 1000 price 18 GST invoice உருவாக்கவும்"],
  [LANGUAGE_CODE.TELUGU, "Acme Traders కోసం service 2 qty 1000 price 18 GST invoice సృష్టించండి"],
] as const;

describe("Sarvam regional commands reach native Aupulens automation", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Organization, Customer, SalesInvoice, AiCommandProposal, CrmAuditLog, Counter].map((model: any) => model.init()));
  });

  beforeEach(async () => {
    setSarvamEnv(true);
    clearLanguageCache();
    clearReplyCache();
    mockAuth.mockResolvedValue({ user: { id: String(userId), tenantId, role: "admin" } });
    mockAzure.mockReset();
    mockAzure.mockImplementation(async (prompt: string) => {
      const lower = prompt.toLowerCase();
      expect(lower).toMatch(/create (an )?invoice/);
      expect(prompt).toContain("Acme Traders");
      expect(prompt).toContain("1000");
      return { text: invoiceClassifierJson, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    });
    mockRecordAiUsage.mockClear();
    mockRecordSarvamUsage.mockClear();
    setSarvamClientForTests(fakeClient((r) => {
      if (r.target === "en-IN") return { text: translatedInvoiceCommand(r.input), source: r.source === "auto" ? "hi-IN" : r.source };
      return { text: r.input, source: "en-IN" };
    }));

    await Organization.create({ name: "Regional AI", subdomain: tenantId, ownerUserId: userId, tier: "starter", settings: { ai: {} } });
    await Customer.create({ tenantId, header: { name: "Acme Traders" }, createdBy: userId });
  });

  afterEach(async () => {
    setSarvamClientForTests(null);
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    (globalThis as any).mongoose = { conn: null, promise: null };
  });

  it.each(regionalInvoiceCommands)("%s command creates a real invoice proposal and confirm executes the native invoice action", async (_language, command) => {
    const { POST } = await import("@/app/api/ai/command/route");
    const proposed = await POST(req(command));
    expect(proposed.status).toBe(200);
    const body = await proposed.json();

    expect(body.action).toBe("confirm");
    expect(body.actionType).toBe("create_invoice");
    expect(body.requiresConfirmation).toBe(true);
    expect(body.summary).toContain("Create a DRAFT invoice");
    expect(body.preview).toMatchObject({ customer: "Acme Traders", totalAmount: 2360, status: "draft" });
    expect(body.preview.lineItems[0]).toMatchObject({ name: "service", qty: 2, unitPrice: 1000, taxRate: 18 });
    expect(await SalesInvoice.countDocuments({ tenantId })).toBe(0);

    const proposal = await AiCommandProposal.findOne({ _id: body.proposalId, tenantId }).lean();
    expect(proposal?.status).toBe(AI_ACTION_STATUS.PROPOSED);
    expect(proposal?.params).toMatchObject({ customerName: "Acme Traders" });

    const { POST: CONFIRM } = await import("@/app/api/ai/command/actions/[id]/confirm/route");
    const executed = await CONFIRM(confirmReq(), { params: Promise.resolve({ id: String(body.proposalId) }) });
    expect(executed.status).toBe(200);
    const executedBody = await executed.json();
    expect(executedBody.success).toBe(true);

    const invoice = await SalesInvoice.findOne({ tenantId, customerId: (await Customer.findOne({ tenantId }))!._id }).lean();
    expect(invoice).not.toBeNull();
    expect(executedBody.redirectUrl).toBe(`/sales/invoices/${invoice?._id}`);
    expect(invoice?.status).toBe("draft");
    expect(invoice?.totalAmount).toBe(2360);
    expect(invoice?.lineItems?.[0]).toMatchObject({ name: "service", qty: 2, unitPrice: 1000, taxRate: 18 });
    expect(await CrmAuditLog.countDocuments({ tenantId, record_type: "SalesInvoice", action: "created" })).toBe(1);
  });

  it("English commands do not consume Sarvam, while Azure still classifies the command", async () => {
    const client = fakeClient((r) => ({ text: translatedInvoiceCommand(r.input) }));
    setSarvamClientForTests(client);
    const { POST } = await import("@/app/api/ai/command/route");

    const res = await POST(req("Create an invoice for Acme Traders with item service qty 2 unit price 1000 GST 18"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("confirm");
    expect(mockAzure).toHaveBeenCalledTimes(1);
    expect(client.translateSpy).not.toHaveBeenCalled();
    expect(mockRecordSarvamUsage).not.toHaveBeenCalled();
    expect(mockRecordAiUsage).toHaveBeenCalledTimes(1);
  });

  it("repeating the same regional command uses language caches instead of charging Sarvam again", async () => {
    mockAzure.mockClear();
    mockRecordSarvamUsage.mockClear();
    const client = fakeClient((r) => {
      if (r.target === "en-IN") return { text: translatedInvoiceCommand(r.input), source: "ta-IN" };
      return { text: r.input, source: "en-IN" };
    });
    setSarvamClientForTests(client);
    const { POST } = await import("@/app/api/ai/command/route");
    const command = regionalInvoiceCommands.find(([code]) => code === LANGUAGE_CODE.TAMIL)![1];

    await POST(req(command));
    await POST(req(command));

    expect(mockAzure).toHaveBeenCalledTimes(2);
    expect(client.translateSpy).toHaveBeenCalledTimes(1);
    expect(mockRecordSarvamUsage).toHaveBeenCalledTimes(1);
  });
});
