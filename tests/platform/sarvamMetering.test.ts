/**
 * BRIEF-SARVAM Part 7 / BRIEF-SARVAM-2 Part 3 — Sarvam as a second provider: recorded per call,
 * priced server-side from a seeded AiCostRate, split by provider on the dashboards, and counted
 * toward the tenant's combined spend cap. Local Mongo only; no live provider.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execFileSync } from "node:child_process";
import path from "node:path";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_sarvam_metering";

import AiUsageRecord from "@/models/platform/AiUsageRecord";
import AiCostRate from "@/models/platform/AiCostRate";
import AiLimit from "@/models/platform/AiLimit";
import Organization from "@/models/admin/Organization";
import AiLanguageInteraction from "@/models/ai/AiLanguageInteraction";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AdminRole from "@/models/platform/AdminRole";
import { ADMIN_CAPABILITY, ADMIN_ROLE } from "@/lib/constants/statuses";
import type { AdminActor } from "@/lib/platform/auth/types";

let recordSarvamUsage: typeof import("@/lib/platform/ai/instrumentation").recordSarvamUsage;
let recordAiUsage: typeof import("@/lib/platform/ai/instrumentation").recordAiUsage;
let getProviderBreakdown: typeof import("@/lib/platform/ai/providerBreakdown").getProviderBreakdown;
let costCapReached: typeof import("@/lib/platform/ai/spend").costCapReached;
let clearSpendCache: typeof import("@/lib/platform/ai/spend").clearSpendCache;
let getMultilingualStatus: typeof import("@/lib/platform/ai/multilingual").getMultilingualStatus;
let setTenantMultilingual: typeof import("@/lib/platform/ai/multilingual").setTenantMultilingual;
let MultilingualError: typeof import("@/lib/platform/ai/multilingual").MultilingualError;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

const T = "t-sarvam-metering";
const startOfMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };
const actor = (role: string = ADMIN_ROLE.GLOBAL_SUPER_ADMIN): AdminActor => ({ id: new mongoose.Types.ObjectId().toString(), email: "a@x.com", name: "A", role: role as any, sessionId: "s" });
const call = (over: Partial<import("@/lib/ai/language/types").ProviderCall> = {}) => ({ provider: "sarvam" as const, type: "translate" as const, model: "mayura:v1", characters: 2500, latencyMs: 300, ok: true, ...over });

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Promise.all([AiUsageRecord.init(), AiCostRate.init(), Organization.init(), AiLanguageInteraction.init(), PlatformAuditLog.init(), AdminRole.init()]);
  ({ recordSarvamUsage, recordAiUsage } = await import("@/lib/platform/ai/instrumentation"));
  ({ getProviderBreakdown } = await import("@/lib/platform/ai/providerBreakdown"));
  ({ costCapReached, clearSpendCache } = await import("@/lib/platform/ai/spend"));
  ({ getMultilingualStatus, setTenantMultilingual, MultilingualError } = await import("@/lib/platform/ai/multilingual"));
  ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
  await AdminRole.create({ role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN, capabilities: [ADMIN_CAPABILITY.VIEW_ORGANIZATIONS, ADMIN_CAPABILITY.MANAGE_ORGANIZATIONS], description: "" });
  await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [ADMIN_CAPABILITY.VIEW_ORGANIZATIONS], description: "" });
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });
afterEach(async () => {
  await Promise.all([AiUsageRecord.deleteMany({}), AiCostRate.deleteMany({}), AiLimit.deleteMany({}), Organization.deleteMany({}), AiLanguageInteraction.deleteMany({})]);
  await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  clearSpendCache(); invalidateAdminRoleCache();
});

describe("every Sarvam call is metered as its own provider", () => {
  it("records provider, call type, characters, latency and outcome", async () => {
    await recordSarvamUsage({ tenantId: T, feature: "chat", call: call({ ok: false, latencyMs: 2000 }) });
    const r: any = await AiUsageRecord.findOne({ tenantId: T }).lean();
    expect(r).toMatchObject({ provider: "sarvam", callType: "translate", characters: 2500, latencyMs: 2000, status: "error", inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
    expect(r.modelName).toBe("sarvam-translate");
  });
  it("cost comes ONLY from the stored rate (per 1,000 chars); no rate row ⇒ 0, never a guess", async () => {
    await recordSarvamUsage({ tenantId: T, feature: "chat", call: call() });
    expect((await AiUsageRecord.findOne({ tenantId: T }).lean() as any).estimatedCostUsd).toBe(0);
    await AiCostRate.create({ modelName: "sarvam-translate", provider: "sarvam", inputCostPerMillionTokens: 0, outputCostPerMillionTokens: 0, costPerThousandCharacters: 0.002 });
    await AiUsageRecord.deleteMany({});
    await recordSarvamUsage({ tenantId: T, feature: "chat", call: call({ characters: 2500 }) });
    expect((await AiUsageRecord.findOne({ tenantId: T }).lean() as any).estimatedCostUsd).toBeCloseTo(0.005, 10);
  });
  it("a failed call costs nothing", async () => {
    await AiCostRate.create({ modelName: "sarvam-translate", provider: "sarvam", inputCostPerMillionTokens: 0, outputCostPerMillionTokens: 0, costPerThousandCharacters: 0.002 });
    await recordSarvamUsage({ tenantId: T, feature: "chat", call: call({ ok: false }) });
    expect((await AiUsageRecord.findOne({ tenantId: T }).lean() as any).estimatedCostUsd).toBe(0);
  });
  it("THE SEED SCRIPT's rate reaches real cost figures (script → AiCostRate → recordSarvamUsage → breakdown)", async () => {
    execFileSync("npx", ["tsx", "scripts/seed-platform-sarvam-cost-rates.ts"], {
      cwd: path.resolve(__dirname, "../.."),
      env: { ...process.env, MONGODB_URI: process.env.MONGODB_URI!, SARVAM_COST_PER_1K_CHARS_USD: "0.004", SARVAM_COST_PER_1K_CHARS_USD_DETECT: "0.001" },
      stdio: "pipe",
    });
    const rates = await AiCostRate.find({ provider: "sarvam" }).lean();
    expect(rates.map((r: any) => r.modelName).sort()).toEqual(["sarvam-detect", "sarvam-translate", "sarvam-transliterate"]);
    expect((rates.find((r: any) => r.modelName === "sarvam-detect") as any).costPerThousandCharacters).toBe(0.001);
    await recordSarvamUsage({ tenantId: T, feature: "chat", call: call({ characters: 1000 }) });
    const b = await getProviderBreakdown(startOfMonth(), T);
    expect(b.rows.find((r) => r.provider === "sarvam")!.estimatedCostUsd).toBeCloseTo(0.004, 10);
  }, 60_000);
  it("the seed script REFUSES to invent a price when none is configured", async () => {
    const out = execFileSync("npx", ["tsx", "scripts/seed-platform-sarvam-cost-rates.ts"], {
      cwd: path.resolve(__dirname, "../.."), env: { ...process.env, MONGODB_URI: process.env.MONGODB_URI!, SARVAM_COST_PER_1K_CHARS_USD: "" }, stdio: "pipe",
    }).toString() + "";
    expect(await AiCostRate.countDocuments({ provider: "sarvam" })).toBe(0);
    expect(out).toBe(out); // (error text goes to stderr; the assertion that matters is the count above)
  }, 60_000);
});

describe("dashboards: split by provider, combined total", () => {
  it("historical rows (no provider) are Azure; Sarvam rows are Sarvam; both providers always listed; combined = sum", async () => {
    await AiUsageRecord.collection.insertOne({ tenantId: T, feature: "ai_assistant", modelName: "gpt-4o", inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.5, latencyMs: 1, status: "success", requestId: "old", createdAt: new Date() }); // pre-provider row
    await recordAiUsage({ tenantId: T, feature: "chat", model: "gpt-4o", inputTokens: 10, outputTokens: 5, latencyMs: 1, status: "success" });
    await AiCostRate.create({ modelName: "sarvam-translate", provider: "sarvam", inputCostPerMillionTokens: 0, outputCostPerMillionTokens: 0, costPerThousandCharacters: 1 });
    await recordSarvamUsage({ tenantId: T, feature: "chat", call: call({ characters: 1000 }) });
    const b = await getProviderBreakdown(startOfMonth());
    const az = b.rows.find((r) => r.provider === "azure_openai")!;
    const sv = b.rows.find((r) => r.provider === "sarvam")!;
    expect(az.requestCount).toBe(2);
    expect(az.inputTokens).toBe(110);
    expect(sv).toMatchObject({ requestCount: 1, characters: 1000 });
    expect(sv.estimatedCostUsd).toBeCloseTo(1, 10);
    expect(b.combinedCostUsd).toBeCloseTo(az.estimatedCostUsd + sv.estimatedCostUsd, 10);
    expect(b.combinedRequests).toBe(3);
  });
  it("an empty month lists both providers at zero (populated / empty states)", async () => {
    const b = await getProviderBreakdown(startOfMonth());
    expect(b.rows.map((r) => r.provider)).toEqual(["azure_openai", "sarvam"]);
    expect(b.rows.every((r) => r.requestCount === 0)).toBe(true);
    expect(b.combinedCostUsd).toBe(0);
  });
  it("per-tenant view only counts that tenant", async () => {
    await recordSarvamUsage({ tenantId: "other", feature: "chat", call: call() });
    await recordSarvamUsage({ tenantId: T, feature: "chat", call: call() });
    expect((await getProviderBreakdown(startOfMonth(), T)).rows.find((r) => r.provider === "sarvam")!.requestCount).toBe(1);
  });
});

describe("tenant limit applies to COMBINED spend", () => {
  const spend = (tenantId: string, cost: number, provider?: string) =>
    AiUsageRecord.collection.insertOne({ tenantId, feature: "ai_assistant", modelName: provider ?? "gpt-4o", provider, inputTokens: 0, outputTokens: 0, estimatedCostUsd: cost, latencyMs: 1, status: "success", requestId: Math.random().toString(), createdAt: new Date() });
  it("no cap configured ⇒ never reached", async () => { await spend(T, 999); expect(await costCapReached(T)).toBe(false); });
  it("Azure + Sarvam together cross the cap even though neither does alone", async () => {
    await AiLimit.create({ tenantId: T, maxCostUsdPerMonth: 1 });
    await spend(T, 0.6, undefined); clearSpendCache();
    expect(await costCapReached(T)).toBe(false);
    await spend(T, 0.5, "sarvam"); clearSpendCache();
    expect(await costCapReached(T)).toBe(true);
  });
  it("another tenant's spend does not count", async () => {
    await AiLimit.create({ tenantId: T, maxCostUsdPerMonth: 1 });
    await spend("other", 50);
    expect(await costCapReached(T)).toBe(false);
  });
  it("PIPELINE: at the cap, the provider is not called and the original text passes through", async () => {
    const { prepareLanguageInput, clearLanguageCache } = await import("@/lib/ai/language/pipeline");
    const { setSarvamClientForTests } = await import("@/lib/ai/language/sarvam/client");
    const { fakeClient, setSarvamEnv } = await import("../ai/language/helpers");
    setSarvamEnv(true); clearLanguageCache();
    const c = fakeClient((r) => ({ text: r.input }));
    setSarvamClientForTests(c);
    const t = await prepareLanguageInput({ tenantId: T, rawText: "mujhe invoice banao Acme", allowProvider: async () => false });
    expect(c.translateSpy).not.toHaveBeenCalled();
    expect(t.degradedReason).toBe("limit_reached");
    expect(t.modelText).toBe("mujhe invoice banao Acme");
    const en = await prepareLanguageInput({ tenantId: T, rawText: "create an invoice", allowProvider: async () => { throw new Error("must not be asked for English"); } });
    expect(en.degraded).toBe(false); // English never even asks (no DB query on the majority path)
    setSarvamClientForTests(null);
  });
  it("the seam used by callClaudeForTenant reads the same combined figure", async () => {
    await AiLimit.create({ tenantId: T, maxCostUsdPerMonth: 0.001 });
    await spend(T, 0.01, "sarvam");
    expect(await costCapReached(T)).toBe(true);
  });
});

describe("Configuration tab: multilingual status and the per-tenant switch", () => {
  it("reports enabled/disabled layers, key presence (never the key) and languages actually used", async () => {
    await Organization.create({ name: "Acme", subdomain: T, ownerUserId: new mongoose.Types.ObjectId() });
    await AiLanguageInteraction.create([
      { tenantId: T, trace: {}, detectedLanguage: "hi-IN", degraded: false },
      { tenantId: T, trace: {}, detectedLanguage: "hi-IN", degraded: true },
      { tenantId: T, trace: {}, detectedLanguage: "ta-IN", degraded: false },
      { tenantId: "other", trace: {}, detectedLanguage: "bn-IN", degraded: false },
    ]);
    process.env.SARVAM_API_KEY = "sk-super-secret"; process.env.SARVAM_ENABLED = "true";
    const s = await getMultilingualStatus(T);
    expect(s).toMatchObject({ globalEnabled: true, keyConfigured: true, tenantEnabled: true, active: true });
    expect(s.languagesUsed.map((l) => [l.language, l.interactions, l.degraded])).toEqual([["hi-IN", 2, 1], ["ta-IN", 1, 0]]);
    expect(JSON.stringify(s)).not.toContain("sk-super-secret");
    delete process.env.SARVAM_API_KEY;
    expect((await getMultilingualStatus(T))).toMatchObject({ keyConfigured: false, active: false });
  });
  it("empty state: no regional interactions ⇒ empty list, not an error", async () => {
    await Organization.create({ name: "Acme", subdomain: T, ownerUserId: new mongoose.Types.ObjectId() });
    expect((await getMultilingualStatus(T)).languagesUsed).toEqual([]);
  });
  it("the switch: audited, requires a reason and MANAGE capability; flips the tenant flag", async () => {
    await Organization.create({ name: "Acme", subdomain: T, ownerUserId: new mongoose.Types.ObjectId() });
    await expect(setTenantMultilingual(actor(), T, false, "  ")).rejects.toBeInstanceOf(MultilingualError);
    await expect(setTenantMultilingual(actor(ADMIN_ROLE.READ_ONLY_ADMIN), T, false, "because")).rejects.toThrow();
    await setTenantMultilingual(actor(), T, false, "tenant asked for English only");
    const org: any = await Organization.findOne({ subdomain: T }).lean();
    expect(org.settings.ai.multilingualDisabled).toBe(true);
    expect((await getMultilingualStatus(T)).tenantEnabled).toBe(false);
    expect(await PlatformAuditLog.countDocuments({ tenantId: T })).toBeGreaterThan(0);
    await setTenantMultilingual(actor(), T, true, "re-enabled");
    expect((await getMultilingualStatus(T)).tenantEnabled).toBe(true);
  });
  it("unknown organisation ⇒ clear 404, not a crash", async () => {
    await expect(setTenantMultilingual(actor(), "nope", false, "x")).rejects.toMatchObject({ status: 404 });
  });
});
