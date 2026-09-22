import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { numbersPreserved, numbersInvented, numberValues } from "@/lib/ai/language/translate";
import { prepareLanguageInput, clearLanguageCache } from "@/lib/ai/language/pipeline";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { fakeClient, setSarvamEnv } from "./helpers";

describe("BRIEF-SARVAM-2 §0.1: number check is by VALUE, not string", () => {
  it("45,000 → 45000: same value, different format — PASSES (no false fallback)", () => {
    expect(numbersPreserved("amount 45000", "amount 45,000")).toBe(true);
    expect(numbersPreserved("amount 45,000", "amount 45000")).toBe(true);
    expect(numbersPreserved("total 100000", "total 1,00,000")).toBe(true); // Indian grouping
    expect(numbersPreserved("total 1234567", "total 12,34,567")).toBe(true);
    expect(numbersPreserved("price 45000", "price 45000.00")).toBe(true);
  });
  it("45000 → 4500: different value — FAILS and must fall back", () => {
    expect(numbersPreserved("amount 45000", "amount 4500")).toBe(false);
    expect(numbersPreserved("amount 45000", "amount 450000")).toBe(false);
    expect(numbersPreserved("amount 45000", "amount 45")).toBe(false);
    expect(numbersPreserved("amount 45000", "amount 4500.0")).toBe(false); // decimal shift
    expect(numbersPreserved("amount 45000", "amount 45.000")).toBe(false); // 45.000 is 45, not 45000
  });
  it("Devanagari / Tamil / Bengali numerals are the same value as Latin digits", () => {
    expect(numbersPreserved("amount 45000", "amount ४५०००")).toBe(true);
    expect(numbersPreserved("amount 45000", "amount ௪௫௦௦௦")).toBe(true);
    expect(numbersPreserved("amount 45000", "amount ৪৫০০০")).toBe(true);
    expect(numbersPreserved("amount 45000", "amount ४५००")).toBe(false);
    expect(numberValues("४५,०००")).toEqual(["45000"]);
  });
  it("a number silently DROPPED entirely fails", () => {
    expect(numbersPreserved("invoice 3 items 45000", "invoice items 45000")).toBe(false);
    expect(numbersPreserved("amount 45000", "amount")).toBe(false);
  });
  it("a repeated number must survive as many times as it appeared", () => {
    expect(numbersPreserved("2 items at 2", "2 items")).toBe(false);
    expect(numbersPreserved("2 items at 2", "two at 2 items 2")).toBe(true);
  });
  it("extra numbers the translator adds are tolerated; placeholder digits are ignored", () => {
    expect(numbersPreserved("pay ZXQ12ZXQ 500", "pay ZXQ12ZXQ 500 in 1 instalment")).toBe(true);
    expect(numbersPreserved("pay ZXQ12ZXQ 500", "pay ZXQ99ZXQ 500")).toBe(true); // placeholder integrity is a separate check
  });
});

describe("a number INVENTED by the translator (nothing in the source to justify it)", () => {
  it("a question with NO numbers at all must not gain one — the exact bug reported live: 'Pichhale ek saal mein kitna revenue hua hai?' (no digits) came back naming a figure of 0", () => {
    expect(numbersInvented("how much revenue in the last year", "the revenue at year-end 0, and at the end of year 1")).toBe(true);
    expect(numbersInvented("Pichhale ek saal mein kitna revenue hua hai", "the revenue at year-end 0")).toBe(true);
  });
  it("a real number is still allowed through unchanged", () => {
    expect(numbersInvented("amount 45000", "the amount is 45000")).toBe(false);
    expect(numbersInvented("amount 45000", "the amount is 45,000")).toBe(false); // same value, different grouping
  });
  it("an extra number with nothing backing it is invented, even alongside a genuine one", () => {
    expect(numbersInvented("amount 45000", "the amount is 45000, page 2")).toBe(true);
  });
  it("placeholder digits (ZXQ12ZXQ itself) are never counted as invented numbers — but a genuinely new number next to one still trips it", () => {
    expect(numbersInvented("pay ZXQ12ZXQ 500", "pay ZXQ12ZXQ 500")).toBe(false); // only the placeholder's own digits repeated, nothing new
    expect(numbersInvented("pay ZXQ12ZXQ 500", "pay ZXQ12ZXQ 500 in 1 instalment")).toBe(true); // "1" has nothing backing it
    expect(numbersInvented("pay ZXQ12ZXQ now", "pay ZXQ12ZXQ 500 now")).toBe(true); // "500" has nothing behind it
  });
  it("dropping a number is not \"inventing\" one (that is numbersPreserved's job)", () => {
    expect(numbersInvented("amount 45000", "the amount")).toBe(false);
  });
});

describe("§0.1 end-to-end: the pipeline honours the value check", () => {
  beforeEach(() => { setSarvamEnv(true); clearLanguageCache(); });
  afterEach(() => setSarvamClientForTests(null));
  it("provider returns 45,000 for 45000 → accepted, no degrade", async () => {
    setSarvamClientForTests(fakeClient((r) => ({ text: r.input.replace("mujhe kal invoice banao", "create invoice").replace("45000", "45,000") })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: "mujhe kal invoice banao Acme 45000" });
    expect(t.degraded).toBe(false);
  });
  it("provider returns Devanagari digits → accepted", async () => {
    setSarvamClientForTests(fakeClient((r) => ({ text: r.input.replace("mujhe kal invoice banao", "create invoice").replace("45000", "४५०००") })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: "mujhe kal invoice banao Acme 45000" });
    expect(t.degraded).toBe(false);
    expect(t.modelText).toContain("45000"); // normalised back to Latin digits before it reaches the model
  });
  it.each([["4500"], ["450000"], [""]])("provider changes/drops the amount (%s) → degraded, original text, low confidence", async (bad) => {
    setSarvamClientForTests(fakeClient((r) => ({ text: r.input.replace("mujhe kal invoice banao", "create invoice").replace("45000", bad) })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: "mujhe kal invoice banao Acme 45000" });
    expect(t.degraded).toBe(true);
    expect(t.modelText).toBe("mujhe kal invoice banao Acme 45000");
    expect(t.lowConfidence).toBe(true);
  });

  it("USER-REPORTED LIVE BUG: a numberless question mistranslated into a fabricated figure degrades to the original — never answered with an invented ₹0", async () => {
    setSarvamClientForTests(fakeClient(() => ({ text: "Pichhale is the revenue at year-end 0, and Hua is the revenue at the end of year 1." })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: "Pichhale Ek saal Mein kitna revenue Hua hai." });
    expect(t.degraded).toBe(true);
    expect(t.degradedReason).toBe("bad_response");
    expect(t.modelText).toBe("Pichhale Ek saal Mein kitna revenue Hua hai."); // the ORIGINAL question reaches Azure, not a made-up "revenue is 0" claim
    expect(t.lowConfidence).toBe(true);
    expect(t.interpretation).toBeUndefined(); // never shows "I understood this as…" for a translation we don't trust
  });
  it("a normal numberless question with a CLEAN translation is unaffected (no false degrade)", async () => {
    setSarvamClientForTests(fakeClient(() => ({ text: "How much revenue was there in the last one year?" })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: "Pichhale Ek saal Mein kitna revenue Hua hai." });
    expect(t.degraded).toBe(false);
    expect(t.modelText).toBe("How much revenue was there in the last one year?");
  });
});
