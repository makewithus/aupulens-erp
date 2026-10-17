import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), provider: vi.fn(), stream: vi.fn() }));
vi.mock("@/auth", () => ({ auth: m.auth }));
// Connect exclusively to the isolated local test database below, never .env or production.
vi.mock("@/lib/db", () => ({ default: async () => {} }));
vi.mock("@/lib/ai/claude", () => ({
  CLAUDE_DEFAULT_MODEL: "test-provider", CLAUDE_DEFAULT_MAX_TOKENS: 1024,
  callClaudeWithUsage: m.provider, callClaudeWithHistoryAndUsage: m.provider, callClaudeStreamWithUsage: m.stream,
}));
import AiUsage from "@/models/admin/AiUsage";
import Organization from "@/models/admin/Organization";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import AiCostRate from "@/models/platform/AiCostRate";
import AiCreditBalance from "@/models/platform/AiCreditBalance";
import AiCreditLedger from "@/models/platform/AiCreditLedger";
import { callClaudeForTenant, callClaudeForTenantStream } from "@/lib/ai/tenantAi";
import { GET } from "@/app/api/ai/usage/route";
import { getWindowUsage } from "@/lib/ai/windowUsage";
import { quotaWindow } from "@/lib/ai/usagePolicy";

const suiteId = randomUUID().slice(0, 8);
const tenants: string[] = [];
let tenant: string;
const settings = { usagePolicy: { startsAt: new Date(Date.now() - 60000).toISOString(), session: { minutes: 60, limit: 100 }, weekly: { limit: 500 } } };
const usage = { promptTokens: 21, completionTokens: 13, totalTokens: 34 };
beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_usage_indicator_${suiteId}`, { serverSelectionTimeoutMS: 3000 });
  await Promise.all([AiUsage.init(), Organization.init(), AiUsageRecord.init(), AiCostRate.init(), AiCreditBalance.init(), AiCreditLedger.init()]);
});
beforeEach(async () => {
  tenant = `usage-${randomUUID().slice(0, 8)}`;
  tenants.push(tenant);
  await Organization.create({ name: "Usage test", subdomain: tenant, ownerUserId: new mongoose.Types.ObjectId(), tier: "starter", settings: { ai: settings } });
  await AiCostRate.findOneAndUpdate({ modelName: "test-provider" }, { $set: { modelName: "test-provider", inputCostPerMillionTokens: 2.5, outputCostPerMillionTokens: 10, effectiveFrom: new Date() } }, { upsert: true });
  m.auth.mockResolvedValue({ user: { id: "test-user", tenantId: tenant, role: "admin" } });
  m.provider.mockResolvedValue({ text: "provider response", usage });
  m.stream.mockImplementation(async function* () { yield "first"; yield "second"; return usage; });
});
afterAll(async () => {
  // Delete only test-created rows, preserving the database and its indexes.
  if (mongoose.connection.readyState === 1) {
    await AiUsage.deleteMany({ tenantId: { $in: [...tenants, "__platform__"] } });
    await Organization.deleteMany({ subdomain: { $in: tenants } });
    await AiUsageRecord.deleteMany({ tenantId: { $in: tenants } });
    await AiCostRate.deleteMany({ modelName: "test-provider" });
    await AiCreditBalance.deleteMany({ tenantId: { $in: tenants } });
    await AiCreditLedger.deleteMany({ tenantId: { $in: tenants } });
  }
  await mongoose.disconnect();
});
describe("real MongoDB request accounting and summary flow", () => {
  it("provider → atomic accounting → authenticated API → real quota values", async () => {
    await callClaudeForTenant(tenant, "starter", settings, "test");
    const response = await GET();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.session).toMatchObject({ used: 1, limit: 100, percentage: 1 });
    expect(data.weekly).toMatchObject({ used: 1, limit: 500 });
    expect(data.monthly).toMatchObject({ used: 1, limit: 100 });
    const record = await AiUsageRecord.findOne({ tenantId: tenant }).lean();
    expect(record).toMatchObject({ inputTokens: 21, outputTokens: 13, status: "success" });
    expect(record).not.toHaveProperty("prompt");
    const balance = await AiCreditBalance.findOne({ tenantId: tenant }).lean();
    expect(balance?.used).toBeGreaterThan(0);
    expect(balance?.reserved).toBe(0);
    expect(data.credits.used).toBe(balance?.used);
  });
  it("does not lose concurrent increments or expose another tenant's counters", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => callClaudeForTenant(tenant, "starter", settings, "concurrent")));
    expect(results.every(result => result.gated === false)).toBe(true);
    const { data } = await (await GET()).json();
    expect(data.session.used).toBe(12); expect(data.weekly.used).toBe(12); expect(data.monthly.used).toBe(12);
    const other = await getWindowUsage(`${tenant}-other`, settings.usagePolicy, new Date());
    expect(other.session.used).toBe(0); expect(other.weekly.used).toBe(0);
  });
  it("stream completion is charged once, cancellation and provider failure are not charged", async () => {
    const result = await callClaudeForTenantStream(tenant, "starter", settings, "stream");
    if (result.gated === true) throw new Error("unexpected gate");
    for await (const chunk of result.stream) expect(chunk).toBeTruthy();
    await result.stream.next(); await result.stream.next();
    const cancelled = await callClaudeForTenantStream(tenant, "starter", settings, "cancel");
    if (cancelled.gated === true) throw new Error("unexpected gate");
    await cancelled.stream.next(); await cancelled.stream.return();
    m.provider.mockRejectedValueOnce(new Error("provider failure"));
    await expect(callClaudeForTenant(tenant, "starter", settings, "failure")).rejects.toThrow("provider failure");
    const { data } = await (await GET()).json();
    expect(data.session.used).toBe(1); expect(data.weekly.used).toBe(1); expect(data.monthly.used).toBe(1);
    expect(await AiUsageRecord.countDocuments({ tenantId: tenant, status: "success" })).toBe(1);
    const balance = await AiCreditBalance.findOne({ tenantId: tenant }).lean();
    expect(balance?.reserved).toBe(0);
    expect(await AiCreditLedger.countDocuments({ tenantId: tenant, status: "refunded" })).toBe(2);
  });
  it("charges a repeated idempotency key at most once", async () => {
    const first = await callClaudeForTenant(tenant, "starter", settings, "same", { idempotencyKey: "retry-safe-request" });
    const retry = await callClaudeForTenant(tenant, "starter", settings, "same", { idempotencyKey: "retry-safe-request" });
    expect(first.gated).toBe(false);
    expect(retry).toMatchObject({ gated: true, code: "AI_CREDITS_EXHAUSTED" });
    expect(await AiCreditLedger.countDocuments({ tenantId: tenant, requestId: "retry-safe-request" })).toBe(1);
    expect(await AiCreditLedger.countDocuments({ tenantId: tenant, requestId: "retry-safe-request", status: "charged" })).toBe(1);
  });
  it("window rollover returns fresh counters and preserves the prior audit window", async () => {
    const admission = new Date();
    await callClaudeForTenant(tenant, "starter", settings, "rollover");
    const nextWeek = new Date(admission.getTime() + 7 * 86400000);
    expect(await getWindowUsage(tenant, settings.usagePolicy, nextWeek)).toMatchObject({ session: { used: 0 }, weekly: { used: 0 } });
    const oldWindow = quotaWindow(settings.usagePolicy, "session", admission);
    if (typeof oldWindow === "string") throw new Error("missing window");
    expect(await AiUsage.findOne({ tenantId: tenant, period: oldWindow.period }).lean()).toMatchObject({ count: 1 });
  });
});
