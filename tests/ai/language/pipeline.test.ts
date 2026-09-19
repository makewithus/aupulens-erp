import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prepareLanguageInput, clearLanguageCache, substituteUserText } from "@/lib/ai/language/pipeline";
import { respondInLanguage } from "@/lib/ai/language/respond";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { fakeClient, setSarvamEnv } from "./helpers";

const DICT: [RegExp, string][] = [
  [/mujhe/gi, "I need to"], [/banana hai/gi, "create"], [/banao/gi, "create"], [/ke liye/gi, "for"],
  [/agle mangalwar/gi, "next Tuesday"], [/रुपये/g, "rupees"], [/इनवॉइस/g, "invoice"], [/बनाओ/g, "create"],
  [/के लिए/g, "for"], [/मुझे/g, "I need to"],
];
const translator = (req: any) => ({ text: DICT.reduce((s, [rx, to]) => s.replace(rx, to), req.input) });

beforeEach(() => { setSarvamEnv(true); clearLanguageCache(); });
afterEach(() => setSarvamClientForTests(null));

describe("pipeline: English short-circuit", () => {
  it("makes zero provider calls and never reads the key", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    setSarvamEnv(false); // even with NO key: English must not degrade
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "Create an invoice for Acme, 45000 rupees" });
    expect(c.translateSpy).not.toHaveBeenCalled();
    expect(t.degraded).toBe(false);
    expect(t.kind).toBe("english");
    expect(t.modelText).toBe("Create an invoice for Acme, 45000 rupees");
    expect(t.changedMaterially).toBe(false);
  });
  it("English typo fix is deterministic, local, and flagged for 'I understood this as'", async () => {
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "create an invoce for Acme, 45k" });
    expect(t.modelText).toBe("create an invoice for Acme, 45000");
    expect(t.changedMaterially).toBe(true);
    expect(t.original).toBe("create an invoce for Acme, 45k"); // original preserved
  });
});

describe("pipeline: regional input", () => {
  it("Roman Hindi -> English, entities restored exactly", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "mujhe Kanchipuram Silks Pvt Ltd ke liye invoice banana hai 45k" });
    expect(t.degraded).toBe(false);
    expect(t.modelText).toBe("I need to Kanchipuram Silks Pvt Ltd for invoice create 45000");
    expect(t.entitiesProtected.map((e) => e.value)).toContain("Kanchipuram Silks Pvt Ltd");
    expect(t.providerCalls).toHaveLength(1);
    expect(t.providerCalls[0].type).toBe("translate");
    expect(t.changedMaterially).toBe(true);
    expect(t.interpretation).toBe(t.modelText);
    // The provider never saw the company name.
    expect((c.translateSpy.mock.calls[0][0] as any).input).not.toContain("Kanchipuram");
  });
  it("code-mixed uses mayura code-mixed mode", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    await prepareLanguageInput({ tenantId: "t1", rawText: "invoice banao for Acme, amount 45000 rupees" });
    expect(c.translateSpy.mock.calls[0][0]).toMatchObject({ model: "mayura:v1", mode: "code-mixed", target: "en-IN" });
  });
  it("Devanagari passes the detected source language", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "मुझे Acme के लिए इनवॉइस बनाओ 45000 रुपये" });
    expect(t.modelText).toContain("invoice");
    expect(t.modelText).toContain("Acme");
    expect((c.translateSpy.mock.calls[0][0] as any).source).toBe("hi-IN");
  });
  it("2,000-char paste is chunked, run in parallel, and reassembled", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    const raw = ("mujhe invoice banao ke liye customer 100. ").repeat(60);
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: raw });
    expect(c.translateSpy.mock.calls.length).toBeGreaterThan(1);
    for (const call of c.translateSpy.mock.calls) expect((call[0] as any).input.length).toBeLessThanOrEqual(2000);
    expect(t.degraded).toBe(false);
    expect((t.modelText.match(/customer 100/g) || []).length).toBe(60);
  });
  it("caches identical input per tenant (no second provider call)", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    const raw = "mujhe invoice banao ke liye Acme";
    await prepareLanguageInput({ tenantId: "t1", rawText: raw });
    const again = await prepareLanguageInput({ tenantId: "t1", rawText: raw });
    expect(again.cacheHit).toBe(true);
    expect(c.translateSpy).toHaveBeenCalledTimes(1);
    await prepareLanguageInput({ tenantId: "t2", rawText: raw }); // other tenant: not shared
    expect(c.translateSpy).toHaveBeenCalledTimes(2);
  });
});

describe("pipeline: fails open, never closed", () => {
  const raw = "mujhe invoice banao ke liye Acme 45000";
  it.each([
    ["timeout", "timeout"], ["provider error", "http"], ["nonsense (bad_response)", "bad_response"],
  ])("Sarvam %s => original text, degraded", async (_n, kind) => {
    setSarvamClientForTests(fakeClient(() => ({ fail: kind })));
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: raw });
    expect(t.degraded).toBe(true);
    expect(t.modelText).toBe(raw);
    expect(t.lowConfidence).toBe(true);
    expect(t.degradedReason).toBeTruthy();
  });
  it("no key => not_configured, original text, no provider call", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    setSarvamEnv(false);
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: raw });
    expect(t.degradedReason).toBe("not_configured");
    expect(t.modelText).toBe(raw);
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("global kill switch SARVAM_ENABLED=false", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    process.env.SARVAM_ENABLED = "false";
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: raw });
    expect(t.degradedReason).toBe("disabled_global");
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("tenant switch", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: raw, multilingualDisabled: true });
    expect(t.degradedReason).toBe("disabled_tenant");
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
  it("unsupported language => passthrough", async () => {
    const c = fakeClient(translator);
    setSarvamClientForTests(c);
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "请给客户创建发票" });
    expect(t.degradedReason).toBe("unsupported_language");
    expect(t.modelText).toBe("请给客户创建发票");
  });
  it("provider drops an entity placeholder => degrade (never act on a translation missing the customer)", async () => {
    setSarvamClientForTests(fakeClient((req) => ({ text: req.input.replace(/ZXQ\d+ZXQ/g, "") })));
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "mujhe Acme Traders ke liye invoice banao" });
    expect(t.degraded).toBe(true);
    expect(t.modelText).toContain("Acme Traders");
  });
  it("ADVERSARIAL: provider silently changes the amount => degrade", async () => {
    setSarvamClientForTests(fakeClient((req) => ({ text: req.input.replace("45000", "54000") })));
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "mujhe invoice banao Acme 45000" });
    expect(t.degraded).toBe(true);
    expect(t.modelText).toBe("mujhe invoice banao Acme 45000");
    expect(t.lowConfidence).toBe(true);
  });
  it("ADVERSARIAL: provider swaps the customer for a different name => placeholder restores the ORIGINAL", async () => {
    setSarvamClientForTests(fakeClient((req) => ({ text: translator(req).text + " Acme Industries" })));
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "mujhe Acme Traders ke liye invoice banao" });
    expect(t.modelText.startsWith("I need to Acme Traders for invoice create")).toBe(true);
    expect(t.lowConfidence).toBe(true); // an invented name is flagged so callers ASK instead of acting
  });
  it("provider emitting '45,000' for '45000' is accepted (format only)", async () => {
    setSarvamClientForTests(fakeClient((req) => ({ text: translator(req).text.replace("45000", "45,000") })));
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: "mujhe invoice banao Acme 45000" });
    expect(t.degraded).toBe(false);
    expect(t.modelText).toContain("45000");
  });
  it("a throwing provider still cannot break the pipeline", async () => {
    const c = fakeClient(translator);
    (c as any).translate = async () => { throw new Error("boom"); };
    setSarvamClientForTests(c);
    const t = await prepareLanguageInput({ tenantId: "t1", rawText: raw });
    expect(t.degraded).toBe(true);
    expect(t.modelText).toBe(raw);
  });
});

describe("substituteUserText", () => {
  it("replaces the raw text inside a composed prompt", () => {
    expect(substituteUserText("CONTEXT\nQ: namaste\nA:", "namaste", "hello")).toBe("CONTEXT\nQ: hello\nA:");
  });
  it("appends the English rendering when the route reshaped the text", () => {
    expect(substituteUserText("CONTEXT only", "namaste", "hello")).toContain("understood in English: hello");
  });
  it("is a no-op when nothing changed", () => expect(substituteUserText("x y", "y", "y")).toBe("x y"));
  it("does not treat $ in the replacement as a pattern", () => expect(substituteUserText("Q: a", "a", "$& $1")).toBe("Q: $& $1"));
});

describe("respond: reply in the user's language, entities untouched", () => {
  const trace = (over: any = {}) => ({ kind: "native", detectedLanguage: "ta-IN", script: "Taml", degraded: false, changedMaterially: false, ...over }) as any;
  it("translates the reply but keeps identifiers, amounts and **UI labels** verbatim", async () => {
    const c = fakeClient((req) => ({ text: "தமிழ்: " + req.input }));
    setSarvamClientForTests(c);
    const reply = "Open **Sales > Invoices** and find INV-2024-0042 for Acme Traders, total 45000.";
    const r = await respondInLanguage(reply, trace());
    expect(r.translated).toBe(true);
    expect(r.text).toContain("**Sales > Invoices**");
    expect(r.text).toContain("INV-2024-0042");
    expect(r.text).toContain("Acme Traders");
    expect(r.text).toContain("45000");
    expect((c.translateSpy.mock.calls[0][0] as any).input).not.toContain("INV-2024-0042");
    expect((c.translateSpy.mock.calls[0][0] as any).target).toBe("ta-IN");
  });
  it("Roman-script users get output_script roman", async () => {
    const c = fakeClient((req) => ({ text: req.input }));
    setSarvamClientForTests(c);
    await respondInLanguage("Done.", trace({ kind: "romanised", detectedLanguage: "hi-IN", script: "Latn" }));
    expect((c.translateSpy.mock.calls[0][0] as any).outputScript).toBe("roman");
  });
  it("translation failure => English reply, still shows interpretation", async () => {
    setSarvamClientForTests(fakeClient(() => ({ fail: "timeout" })));
    const r = await respondInLanguage("Here you go.", trace({ changedMaterially: true, interpretation: "create invoice for Acme" }));
    expect(r.translated).toBe(false);
    expect(r.text).toContain("Here you go.");
    expect(r.text).toContain('I understood this as:* "create invoice for Acme"');
  });
  it("translation that changes a number is discarded", async () => {
    setSarvamClientForTests(fakeClient((req) => ({ text: req.input.replace("45000", "54000") })));
    const r = await respondInLanguage("Total is 45000.", trace());
    expect(r.translated).toBe(false);
    expect(r.text).toBe("Total is 45000.");
  });
  it("code-mixed and English input get English replies (no call)", async () => {
    const c = fakeClient((req) => ({ text: req.input }));
    setSarvamClientForTests(c);
    const r = await respondInLanguage("Done.", trace({ kind: "mixed" }));
    expect(r.text).toBe("Done.");
    expect(c.translateSpy).not.toHaveBeenCalled();
  });
});
