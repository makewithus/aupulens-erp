import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockClaude, mockFinalise, mockStream } = vi.hoisted(() => ({ mockClaude: vi.fn(), mockFinalise: vi.fn(), mockStream: vi.fn() }));

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/admin/Organization", () => ({ default: { findOne: vi.fn() } }));
vi.mock("@/lib/ai/claude", () => ({
  callClaudeWithUsage: mockClaude,
  callClaudeWithHistoryAndUsage: mockClaude,
  callClaudeStreamWithUsage: mockStream,
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
vi.mock("@/lib/platform/ai/spend", () => ({ costCapReached: vi.fn(async () => false) }));
vi.mock("@/lib/platform/ai/credits", () => ({
  reserveAiCredits: vi.fn(async ({ requestId }: any) => ({ allowed: true, requestId: requestId ?? "test-request", estimatedCredits: 0 })),
  settleAiCredits: vi.fn(async () => undefined),
}));
vi.mock("@/models/ai/AiLanguageInteraction", () => ({ default: { create: vi.fn(async () => ({})) } }));

import * as usage from "@/lib/ai/usage";
import { callClaudeForTenant, callClaudeForTenantStream } from "@/lib/ai/tenantAi";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { clearLanguageCache } from "@/lib/ai/language/pipeline";
import { recordSarvamUsage } from "@/lib/platform/ai/instrumentation";
import { fakeClient, setSarvamEnv } from "./helpers";

const ok = { text: "Sure. Open **Sales > Invoices**.", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
const tr = (req: any) => ({ text: req.input
  .replace(/mujhe kal invoice banao/i, "I want to create an invoice")
  .replace(/Humne pichli chat pr kya discuss kiya tha wahi se shuru karte ha/i, "Let's continue from where we left off in the previous chat") });

beforeEach(() => { mockClaude.mockReset(); mockClaude.mockResolvedValue(ok); setSarvamEnv(true); clearLanguageCache(); vi.mocked(recordSarvamUsage).mockClear(); });
afterEach(() => setSarvamClientForTests(null));

describe("callClaudeForTenant + language option", () => {
  it("WITHOUT the option: the model receives the exact prompt, no Sarvam, identical result shape", async () => {
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: mujhe kal invoice banao");
    expect(mockClaude.mock.calls[0][0]).toBe("Q: mujhe kal invoice banao");
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
  it("WITH the option and Roman Hindi: model gets English and the reply has no translation preamble", async () => {
    setSarvamClientForTests(fakeClient(tr));
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: mujhe kal invoice banao\nA:", { language: { rawText: "mujhe kal invoice banao", showInterpretation: false }, feature: "chat" });
    expect(mockClaude.mock.calls[0][0]).toBe("Q: I want to create an invoice\nA:");
    expect(mockClaude.mock.calls[0][1].systemPrompt).toContain("same Latin/Roman script");
    expect(recordSarvamUsage).toHaveBeenCalled();
    if (r.gated === true) throw new Error("gated");
    expect(r.text).not.toContain("I understood this as");
    expect(r.language?.changedMaterially).toBe(true);
  });
  it("Romanized Hindi request to resume a prior chat is answered in the same script", async () => {
    setSarvamClientForTests(fakeClient(tr));
    const raw = "Humne pichli chat pr kya discuss kiya tha wahi se shuru karte ha";
    const r = await callClaudeForTenant("t1", "starter", {}, `Q: ${raw}\nA:`, { language: { rawText: raw, showInterpretation: false } });
    expect(mockClaude.mock.calls[0][0]).toContain("Let's continue from where we left off in the previous chat");
    expect(mockClaude.mock.calls[0][1].systemPrompt).toContain("hi-IN");
    expect(mockClaude.mock.calls[0][1].systemPrompt).toContain("same Latin/Roman script");
    if (r.gated === true) throw new Error("gated");
    expect(r.text).not.toContain("Summary of the Previous Chat");
  });
  it("Sarvam down: the model still gets the ORIGINAL text and the user still gets an answer", async () => {
    setSarvamClientForTests(fakeClient(() => ({ fail: "timeout" })));
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: mujhe kal invoice banao", { language: { rawText: "mujhe kal invoice banao" } });
    expect(mockClaude.mock.calls[0][0]).toBe("Q: mujhe kal invoice banao");
    if (r.gated === true) throw new Error("gated");
    expect(r.text).toContain(ok.text);
    expect(r.language?.degraded).toBe(true);
  });
  it("tenant AI switch off: gated BEFORE any Sarvam call", async () => {
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    const r = await callClaudeForTenant("t1", "starter", { disabled: true }, "Q: mujhe kal invoice banao", { language: { rawText: "mujhe kal invoice banao" } });
    expect(r.gated).toBe(true);
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("tenant at its AI limit: gated BEFORE any Sarvam call (no free translation)", async () => {
    vi.mocked(usage.getAiUsageCount).mockResolvedValueOnce(10_000_000);
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    const r = await callClaudeForTenant("t1", "starter", {}, "Q: mujhe kal invoice banao", { language: { rawText: "mujhe kal invoice banao" } });
    expect(r.gated && r.code).toBe("AI_LIMIT_REACHED");
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("Azure fails after a successful translation: error propagates as before, Sarvam usage still recorded", async () => {
    setSarvamClientForTests(fakeClient(tr));
    mockClaude.mockRejectedValueOnce(new Error("azure down"));
    await expect(callClaudeForTenant("t1", "starter", {}, "Q: mujhe kal invoice banao", { language: { rawText: "mujhe kal invoice banao" } })).rejects.toThrow("azure down");
    expect(recordSarvamUsage).toHaveBeenCalled();
  });
  it("per-tenant multilingualDisabled => original text, no Sarvam", async () => {
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    await callClaudeForTenant("t1", "starter", { multilingualDisabled: true }, "Q: mujhe kal invoice banao", { language: { rawText: "mujhe kal invoice banao" } });
    expect(mockClaude.mock.calls[0][0]).toBe("Q: mujhe kal invoice banao");
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
});

describe("§0.4 streaming: regional replies are translated before they are emitted", () => {
  const streamOf = (chunks: string[]) => async function* () { for (const c of chunks) yield c; return { promptTokens: 1, completionTokens: 1, totalTokens: 2 }; };
  const drain = async (r: any) => { const out: string[] = []; if (r.gated === true) throw new Error("gated"); for await (const d of r.stream) out.push(d); return out; };

  it("WITHOUT the option: the stream gets the exact prompt and yields exactly what the model yields", async () => {
    mockStream.mockReset(); mockStream.mockImplementation(streamOf(["Hel", "lo"]));
    const c = fakeClient(tr); setSarvamClientForTests(c);
    const out = await drain(await callClaudeForTenantStream("t1", "starter", {}, "Q: mujhe kal invoice banao"));
    expect(mockStream.mock.calls[0][1]).toBe("Q: mujhe kal invoice banao");
    expect(out).toEqual(["Hel", "lo"]);
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("WITH the option and Roman Hindi: translates the completed response and records both Sarvam calls", async () => {
    mockStream.mockReset(); mockStream.mockImplementation(streamOf(["Sure."]));
    const c = fakeClient(tr);
    setSarvamClientForTests(c);
    const out = await drain(await callClaudeForTenantStream("t1", "starter", {}, "Q: mujhe kal invoice banao\nA:", { language: { rawText: "mujhe kal invoice banao", showInterpretation: false } }));
    expect(mockStream.mock.calls[0][1]).toBe("Q: I want to create an invoice\nA:");
    expect(out).toEqual(["Sure."]);
    expect(c.translateSpy).toHaveBeenCalledTimes(2);
    expect(recordSarvamUsage).toHaveBeenCalled();
  });
  it("English text with the option: no extra chunk, no provider call", async () => {
    mockStream.mockReset(); mockStream.mockImplementation(streamOf(["ok"]));
    const c = fakeClient(tr); setSarvamClientForTests(c);
    const out = await drain(await callClaudeForTenantStream("t1", "starter", {}, "Q: show balance", { language: { rawText: "show balance" } }));
    expect(out).toEqual(["ok"]);
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("Sarvam down: the original text is streamed to the model; the user still gets an answer", async () => {
    mockStream.mockReset(); mockStream.mockImplementation(streamOf(["fine"]));
    setSarvamClientForTests(fakeClient(() => ({ fail: "timeout" })));
    const out = await drain(await callClaudeForTenantStream("t1", "starter", {}, "Q: mujhe kal invoice banao", { language: { rawText: "mujhe kal invoice banao" } }));
    expect(mockStream.mock.calls[0][1]).toBe("Q: mujhe kal invoice banao");
    expect(out).toEqual(["fine"]);
  });
  it("gated tenant: no Sarvam call before the gate", async () => {
    const c = fakeClient(tr); setSarvamClientForTests(c);
    const r = await callClaudeForTenantStream("t1", "starter", { disabled: true }, "Q", { language: { rawText: "mujhe kal invoice banao" } });
    expect((r as any).gated).toBe(true);
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
});
