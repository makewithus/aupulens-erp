import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  db: vi.fn(), read: vi.fn(), increment: vi.fn(), globalRead: vi.fn(), globalIncrement: vi.fn(),
  call: vi.fn(), history: vi.fn(), stream: vi.fn(), record: vi.fn(), threshold: vi.fn(), decision: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: m.db }));
vi.mock("@/models/admin/Organization", () => ({ default: {} }));
vi.mock("@/lib/ai/usage", () => ({ getAiPeriod: () => "202610", getAiUsageCount: m.read, incrementAiUsage: m.increment, getGlobalMonthlyCap: () => 17000, getGlobalAiUsageCount: m.globalRead, incrementGlobalAiUsage: m.globalIncrement }));
vi.mock("@/lib/ai/claude", () => ({ callClaudeWithUsage: m.call, callClaudeWithHistoryAndUsage: m.history, callClaudeStreamWithUsage: m.stream, CLAUDE_DEFAULT_MODEL: "test-model", CLAUDE_DEFAULT_MAX_TOKENS: 1024 }));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordAiUsage: m.record }));
vi.mock("@/lib/platform/ai/limitBehavior", () => ({ checkAiUsageThresholdCrossing: m.threshold, resolveAtLimitDecision: m.decision }));
vi.mock("@/lib/platform/ai/credits", () => ({
  reserveAiCredits: vi.fn(async ({ requestId }: any) => ({ allowed: true, requestId: requestId ?? "test-request", estimatedCredits: 0 })),
  settleAiCredits: vi.fn(async () => undefined),
}));
import { callClaudeForTenant, callClaudeForTenantStream } from "@/lib/ai/tenantAi";
const settings = { usagePolicy: { startsAt: "2020-01-01T00:00:00Z", session: { minutes: 60, limit: 10 }, weekly: { limit: 100 } } };
const providerUsage = { promptTokens: 21, completionTokens: 13, totalTokens: 34 };
beforeEach(() => {
  vi.resetAllMocks();
  m.read.mockResolvedValue(0); m.globalRead.mockResolvedValue(0);
  m.call.mockResolvedValue({ text: "answer", usage: providerUsage });
  m.decision.mockResolvedValue({ action: "block" });
  m.stream.mockImplementation(async function* () { yield "first"; yield "second"; return providerUsage; });
});
describe("provider completion → counters → summary source", () => {
  it("meters actual provider tokens and counts one successful request in each window", async () => {
    expect(await callClaudeForTenant("org-a", "starter", settings, "hello")).toEqual({ gated: false, text: "answer" });
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 21, outputTokens: 13, status: "success" }));
    expect(m.increment).toHaveBeenCalledTimes(3); // monthly, session, weekly
    expect(m.increment.mock.calls.map(c => c[0])).toEqual(["org-a", "org-a", "org-a"]);
  });
  it("counts a stream once after completion, never per chunk or repeated done callback", async () => {
    const result = await callClaudeForTenantStream("org-a", "starter", settings, "hello");
    if (result.gated === true) throw new Error("unexpected gate");
    expect((await result.stream.next()).value).toBe("first");
    expect(m.increment).not.toHaveBeenCalled();
    expect((await result.stream.next()).value).toBe("second");
    expect(m.increment).not.toHaveBeenCalled();
    expect((await result.stream.next()).done).toBe(true);
    await result.stream.next(); await result.stream.next();
    expect(m.increment).toHaveBeenCalledTimes(3);
    expect(m.record).toHaveBeenCalledTimes(1);
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 21, outputTokens: 13 }));
  });
  it("does not count failed or cancelled partial streams", async () => {
    let result = await callClaudeForTenantStream("org-a", "starter", settings, "hello");
    if (result.gated === true) throw new Error("unexpected gate");
    await result.stream.next(); await result.stream.return();
    expect(m.increment).not.toHaveBeenCalled();
    m.stream.mockImplementation(async function* () { yield "partial"; throw new Error("interrupted"); });
    result = await callClaudeForTenantStream("org-a", "starter", settings, "hello");
    if (result.gated === true) throw new Error("unexpected gate");
    await result.stream.next(); await expect(result.stream.next()).rejects.toThrow("interrupted");
    expect(m.increment).not.toHaveBeenCalled();
  });
  it("records failures without charging requests", async () => {
    m.call.mockRejectedValue(new Error("provider failed"));
    await expect(callClaudeForTenant("org-a", "starter", settings, "hello")).rejects.toThrow("provider failed");
    expect(m.increment).not.toHaveBeenCalled();
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ status: "error", inputTokens: 0, outputTokens: 0 }));
  });
  it("enforces zero and exhausted session/weekly quotas in the backend", async () => {
    for (const kind of ["session", "weekly"] as const) {
      const limited = { usagePolicy: { ...settings.usagePolicy, [kind]: { ...settings.usagePolicy[kind], limit: 0 } } };
      expect(await callClaudeForTenant("org-a", "starter", limited, "hello")).toMatchObject({ gated: true, code: "AI_LIMIT_REACHED", requiredAction: "wait_for_reset" });
      expect(await callClaudeForTenantStream("org-a", "starter", limited, "hello")).toMatchObject({ gated: true, code: "AI_LIMIT_REACHED" });
    }
    expect(m.call).not.toHaveBeenCalled(); expect(m.stream).not.toHaveBeenCalled();
  });
  it("permits unlimited window quotas while preserving the monthly gate", async () => {
    const unlimited = { usagePolicy: { ...settings.usagePolicy, session: { minutes: 60, limit: null }, weekly: { limit: null } } };
    expect((await callClaudeForTenant("org-a", "starter", unlimited, "hello")).gated).toBe(false);
    m.read.mockImplementation((_tenant: string, period: string) => Promise.resolve(period === "202610" ? 100 : 0));
    expect(await callClaudeForTenant("org-a", "starter", unlimited, "hello")).toMatchObject({ gated: true, code: "AI_LIMIT_REACHED" });
  });
  it("successful request accounting does not estimate tokens from response length", async () => {
    // Existing provider adapter uses zeros when usage is absent; quotas count successful calls, not tokens.
    m.call.mockResolvedValue({ text: "a long response".repeat(100), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
    await callClaudeForTenant("org-a", "starter", settings, "hello");
    expect(m.increment).toHaveBeenCalledTimes(3);
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 0, outputTokens: 0 }));
  });
});

it("preserves successful provider telemetry when supplemental window accounting fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  m.increment.mockImplementation((_tenant: string, period: string) => period.startsWith("session:") ? Promise.reject(new Error("window write failed")) : Promise.resolve());
  await expect(callClaudeForTenant("org-a", "starter", settings, "hello")).rejects.toThrow("window write failed");
  expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ status: "success", inputTokens: 21, outputTokens: 13 }));
  const result = await callClaudeForTenantStream("org-a", "starter", settings, "hello");
  if (result.gated === true) throw new Error("unexpected gate");
  await result.stream.next(); await result.stream.next();
  await expect(result.stream.next()).rejects.toThrow("window write failed");
  expect(m.record).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalled(); log.mockRestore();
});
