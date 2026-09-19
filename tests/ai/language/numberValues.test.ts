import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { numbersPreserved, numberValues } from "@/lib/ai/language/translate";
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

describe("§0.1 end-to-end: the pipeline honours the value check", () => {
  beforeEach(() => { setSarvamEnv(true); clearLanguageCache(); });
  afterEach(() => setSarvamClientForTests(null));
  it("provider returns 45,000 for 45000 → accepted, no degrade", async () => {
    setSarvamClientForTests(fakeClient((r) => ({ text: r.input.replace("mujhe invoice banao", "create invoice").replace("45000", "45,000") })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: "mujhe invoice banao Acme 45000" });
    expect(t.degraded).toBe(false);
  });
  it("provider returns Devanagari digits → accepted", async () => {
    setSarvamClientForTests(fakeClient((r) => ({ text: r.input.replace("mujhe invoice banao", "create invoice").replace("45000", "४५०००") })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: "mujhe invoice banao Acme 45000" });
    expect(t.degraded).toBe(false);
    expect(t.modelText).toContain("45000"); // normalised back to Latin digits before it reaches the model
  });
  it.each([["4500"], ["450000"], [""]])("provider changes/drops the amount (%s) → degraded, original text, low confidence", async (bad) => {
    setSarvamClientForTests(fakeClient((r) => ({ text: r.input.replace("mujhe invoice banao", "create invoice").replace("45000", bad) })));
    const t = await prepareLanguageInput({ tenantId: "t", rawText: "mujhe invoice banao Acme 45000" });
    expect(t.degraded).toBe(true);
    expect(t.modelText).toBe("mujhe invoice banao Acme 45000");
    expect(t.lowConfidence).toBe(true);
  });
});
