import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prepareLanguageInput, clearLanguageCache } from "@/lib/ai/language/pipeline";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { fakeClient, setSarvamEnv } from "./helpers";

/** Our OWN overhead only (provider mocked at 0ms). Budgets are the brief's; CI-safe margins. */
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

async function sample(n: number, fn: (i: number) => Promise<unknown>) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn(i);
    out.push(performance.now() - t);
  }
  return out;
}

const ENGLISH = [
  "Create an invoice for Acme Traders, 45,000, due in 30 days",
  "how do I create an invoice?",
  "show me all overdue invoices for last month and total them by customer",
  "What is the balance of the HDFC bank account as of 31/03/2026?",
  "add a new vendor Kanchipuram Silks Pvt Ltd with GSTIN 27AAPFU0939F1ZV",
  "please send a reminder to Rahul for INV-2024-0042 about 1,25,000 rupees",
];

beforeEach(() => { setSarvamEnv(true); clearLanguageCache(); setSarvamClientForTests(fakeClient((r) => ({ text: r.input }))); });
afterEach(() => setSarvamClientForTests(null));

describe("performance budgets (layer overhead, provider mocked)", () => {
  it("English input: added latency p95 < 50ms (target: ~1ms)", async () => {
    await sample(200, (i) => prepareLanguageInput({ tenantId: "t", rawText: ENGLISH[i % ENGLISH.length] })); // warm-up
    const s = await sample(2000, (i) => prepareLanguageInput({ tenantId: "t", rawText: ENGLISH[i % ENGLISH.length] }));
    console.log(`[perf] english p50=${pct(s, 0.5).toFixed(3)}ms p95=${pct(s, 0.95).toFixed(3)}ms p99=${pct(s, 0.99).toFixed(3)}ms`);
    expect(pct(s, 0.95)).toBeLessThan(50);
  });
  it("Deterministic normalisation only (messy English): p95 < 100ms", async () => {
    const messy = "  PLEASEEEE create​ an   invoce for Kanchipuram Silks Pvt Ltd 🙂🙂 amount forty five thousand,due 30/09/2026 GSTN 27AAPFU0939F1ZV  ";
    const s = await sample(1000, () => prepareLanguageInput({ tenantId: "t", rawText: messy }));
    console.log(`[perf] messy-english p95=${pct(s, 0.95).toFixed(3)}ms`);
    expect(pct(s, 0.95)).toBeLessThan(100);
  });
  it("Regional cached: p95 < 200ms", async () => {
    const raw = "mujhe Acme ke liye invoice banana hai 45k";
    await prepareLanguageInput({ tenantId: "t", rawText: raw });
    const s = await sample(1000, () => prepareLanguageInput({ tenantId: "t", rawText: raw }));
    console.log(`[perf] regional-cached p95=${pct(s, 0.95).toFixed(3)}ms`);
    expect(pct(s, 0.95)).toBeLessThan(200);
  });
  it("Regional uncached, our overhead with a 0ms provider: p95 < 1500ms", async () => {
    const s = await sample(500, (i) => prepareLanguageInput({ tenantId: "t", rawText: `mujhe Acme${i} ke liye invoice banana hai ${i}` }));
    console.log(`[perf] regional-uncached-overhead p95=${pct(s, 0.95).toFixed(3)}ms`);
    expect(pct(s, 0.95)).toBeLessThan(1500);
  });
});
