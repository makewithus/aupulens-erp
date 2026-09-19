import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockClaude, mockFinalise } = vi.hoisted(() => ({ mockClaude: vi.fn(), mockFinalise: vi.fn() }));

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/admin/Organization", () => ({ default: { findOne: vi.fn() } }));
vi.mock("@/lib/ai/claude", () => ({
  callClaudeWithUsage: mockClaude,
  callClaudeWithHistoryAndUsage: mockClaude,
  callClaudeStreamWithUsage: vi.fn(),
  CLAUDE_DEFAULT_MODEL: "test-model",
  CLAUDE_DEFAULT_MAX_TOKENS: 100,
}));
vi.mock("@/lib/ai/usage", () => ({
  getAiPeriod: () => "2026-09",
  getAiUsageCount: vi.fn(async () => 0),
  incrementAiUsage: vi.fn(),
  getGlobalMonthlyCap: () => 1_000_000,
  getGlobalAiUsageCount: vi.fn(async () => 0),
  incrementGlobalAiUsage: vi.fn(),
}));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordAiUsage: vi.fn(), recordSarvamUsage: vi.fn() }));
vi.mock("@/lib/platform/ai/limitBehavior", () => ({
  resolveAtLimitDecision: vi.fn(async () => ({ action: "block" })),
  checkAiUsageThresholdCrossing: vi.fn(),
}));
vi.mock("@/models/ai/AiLanguageInteraction", () => ({ default: { create: vi.fn(async () => ({})) } }));

import * as usage from "@/lib/ai/usage";
import { callClaudeForTenant } from "@/lib/ai/tenantAi";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { clearLanguageCache } from "@/lib/ai/language/pipeline";
import { recordSarvamUsage } from "@/lib/platform/ai/instrumentation";
import { fakeClient, setSarvamEnv } from "./helpers";

const ok = { text: "Sure. Open **Sales > Invoices**.", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
const tr = (req: any) => ({ text: req.input.replace(/mujhe invoice banao/i, "I want to create an invoice") });

beforeEach(() => { mockClaude.mockReset(); mockClaude.mockResolvedValue(ok); setSarvamEnv(true); clearLanguageCache(); vi.mocked(recordSarvamUsage).mockClear(); });
afterEach(() => setSarvamClientForTests(null));

describe("callClaudeForTenant + language option", () => {
  it("WITHOUT the option: the model receives the exact prompt, no Sarvam, identical result shape", async () => {
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: mujhe invoice banao");
    expect(mockClaude.mock.calls[0][0]).toBe("Q: mujhe invoice banao");
    expect(c.translateSpy).not.toHaveBeenCalled();
    expect(r).toEqual({ gated: false, text: ok.text });
  });
  it("WITH the option and English text: prompt unchanged, no provider call, no extra records", async () => {
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: create an invoice for Acme", { language: { rawText: "create an invoice for Acme" } });
    expect(mockClaude.mock.calls[0][0]).toBe("Q: create an invoice for Acme");
    expect(c.translateSpy).not.toHaveBeenCalled();
    expect(recordSarvamUsage).not.toHaveBeenCalled();
    expect(r.gated === false && r.text).toBe(ok.text);
  });
  it("WITH the option and Roman Hindi: model gets English, Sarvam call is metered, reply opens with the interpretation", async () => {
    setSarvamClientForTests(fakeClient(tr));
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: mujhe invoice banao\nA:", { language: { rawText: "mujhe invoice banao" }, feature: "chat" });
    expect(mockClaude.mock.calls[0][0]).toBe("Q: I want to create an invoice\nA:");
    expect(recordSarvamUsage).toHaveBeenCalled();
    if (r.gated === true) throw new Error("gated");
    expect(r.text).toContain("I understood this as");
    expect(r.language?.changedMaterially).toBe(true);
  });
  it("Sarvam down: the model still gets the ORIGINAL text and the user still gets an answer", async () => {
    setSarvamClientForTests(fakeClient(() => ({ fail: "timeout" })));
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: mujhe invoice banao", { language: { rawText: "mujhe invoice banao" } });
    expect(mockClaude.mock.calls[0][0]).toBe("Q: mujhe invoice banao");
    if (r.gated === true) throw new Error("gated");
    expect(r.text).toContain(ok.text);
    expect(r.language?.degraded).toBe(true);
  });
  it("tenant AI switch off: gated BEFORE any Sarvam call", async () => {
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    const r = await callClaudeForTenant("t1", "starter", { disabled: true }, "Q: mujhe invoice banao", { language: { rawText: "mujhe invoice banao" } });
    expect(r.gated).toBe(true);
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("tenant at its AI limit: gated BEFORE any Sarvam call (no free translation)", async () => {
    vi.mocked(usage.getAiUsageCount).mockResolvedValueOnce(10_000_000);
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: mujhe invoice banao", { language: { rawText: "mujhe invoice banao" } });
    expect(r.gated && r.code).toBe("AI_LIMIT_REACHED");
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("Azure fails after a successful translation: error propagates as before, Sarvam usage still recorded", async () => {
    setSarvamClientForTests(fakeClient(tr));
    mockClaude.mockRejectedValueOnce(new Error("azure down"));
    await expect(callClaudeForTenant("t1", "starter", {}, "Q: mujhe invoice banao", { language: { rawText: "mujhe invoice banao" } })).rejects.toThrow("azure down");
    expect(recordSarvamUsage).toHaveBeenCalled();
  });
  it("per-tenant multilingualDisabled => original text, no Sarvam", async () => {
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    await callClaudeForTenant("t1", "starter", { multilingualDisabled: true }, "Q: mujhe invoice banao", { language: { rawText: "mujhe invoice banao" } });
    expect(mockClaude.mock.calls[0][0]).toBe("Q: mujhe invoice banao");
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
});
