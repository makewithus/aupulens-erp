import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prepareLanguageInput, clearLanguageCache } from "@/lib/ai/language/pipeline";
import { respondInLanguage, clearReplyCache } from "@/lib/ai/language/respond";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { placeholdersIntact, protectEntities } from "@/lib/ai/language/protect";
import { fakeClient, setSarvamEnv } from "./helpers";

const RAW = "mujhe Kanchipuram Silks Pvt Ltd ke liye invoice banao 45000";
const base = (s: string) => s.replace("mujhe", "I need to").replace("ke liye", "for").replace("banao", "create");

beforeEach(() => { setSarvamEnv(true); clearLanguageCache(); clearReplyCache(); });
afterEach(() => setSarvamClientForTests(null));

/** How a translator could plausibly corrupt `ZXQ0ZXQ`. Every one must degrade, never leak. */
const MANGLINGS: [string, (s: string) => string][] = [
  ["dropped entirely", (s) => s.replace(/ZXQ\d+ZXQ/g, "")],
  ["truncated (ZXQ0ZX)", (s) => s.replace(/ZXQ(\d+)ZXQ/g, "ZXQ$1ZX")],
  ["prefix only (ZXQ0)", (s) => s.replace(/ZXQ(\d+)ZXQ/g, "ZXQ$1")],
  ["split by space (ZXQ 0 ZXQ) + junk residue", (s) => s.replace(/ZXQ(\d+)ZXQ/g, "ZXQ $1 ZXQ ZXQ")],
  ["duplicated", (s) => s.replace(/(ZXQ\d+ZXQ)/g, "$1 $1")],
  ["index changed (ZXQ7ZXQ)", (s) => s.replace(/ZXQ\d+ZXQ/g, "ZXQ7ZXQ")],
  ["lower-cased fragment residue", (s) => s.replace(/ZXQ(\d+)ZXQ/g, "ZXQ$1ZXQ zxq")],
  ["transliterated into native script", (s) => s.replace(/ZXQ(\d+)ZXQ/g, "ज़ेडएक्सक्यू$1")],
];

describe("§0.3 placeholder corruption is detected and degrades gracefully", () => {
  it.each(MANGLINGS)("input side — %s", async (_n, mangle) => {
    setSarvamClientForTests(fakeClient((r) => ({ text: mangle(base(r.input)) })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: RAW });
    expect(t.degraded).toBe(true);
    expect(t.lowConfidence).toBe(true);
    expect(t.modelText).toBe(RAW); // original text, exactly
    expect(t.modelText).not.toMatch(/ZXQ/i); // no placeholder debris ever reaches the model
    expect(t.translated).not.toMatch(/ZXQ/i);
    expect(t.interpretation).toBeUndefined(); // we never claim to have understood
  });
  it("well-formed placeholders (incl. spacing/case the restore tolerates) still restore EXACTLY", async () => {
    setSarvamClientForTests(fakeClient((r) => ({ text: base(r.input) })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: RAW });
    expect(t.degraded).toBe(false);
    expect(t.modelText).toBe("I need to Kanchipuram Silks Pvt Ltd for invoice create 45000");
  });
  it.each(MANGLINGS)("reply side — %s → English reply kept, no debris", async (_n, mangle) => {
    setSarvamClientForTests(fakeClient((r) => ({ text: mangle(r.input) })));
    const trace = { kind: "native", detectedLanguage: "ta-IN", script: "Taml", degraded: false, changedMaterially: false } as any;
    const reply = "Open **Sales > Invoices** for Acme Traders, INV-2024-0042.";
    const r = await respondInLanguage(reply, trace);
    expect(r.translated).toBe(false);
    expect(r.text).toBe(reply);
    expect(r.text).not.toMatch(/ZXQ/i);
  });
  it("the reply cache never serves a corrupted translation", async () => {
    const c = fakeClient((r) => ({ text: r.input.replace(/ZXQ\d+ZXQ/g, "") }));
    setSarvamClientForTests(c);
    const trace = { kind: "native", detectedLanguage: "ta-IN", script: "Taml", degraded: false, changedMaterially: false } as any;
    await respondInLanguage("See INV-1.", trace);
    await respondInLanguage("See INV-1.", trace);
    expect(c.translateSpy).toHaveBeenCalledTimes(2); // corrupted results are not cached
  });
  it("placeholdersIntact: index out of range / stray fragment / duplicate all fail", () => {
    const { masked, entities } = protectEntities("bill Acme Traders");
    expect(placeholdersIntact(masked, entities)).toBe(true);
    expect(placeholdersIntact(masked + " ZXQ", entities)).toBe(false);
    expect(placeholdersIntact(masked + " ZXQ5ZXQ", entities)).toBe(false);
    expect(placeholdersIntact(masked + " " + masked, entities)).toBe(false);
  });
});
