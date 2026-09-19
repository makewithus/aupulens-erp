import { describe, it, expect, vi, afterEach } from "vitest";
import { makeHarness, translator } from "./harness";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/ai/AiLanguageInteraction", () => ({ default: { create: vi.fn(async () => ({})) } }));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordAiUsage: vi.fn(), recordSarvamUsage: vi.fn() }));
afterEach(() => setSarvamClientForTests(null));

describe("1.1 the classifier and slot filling key off the pipeline's NORMALISED ENGLISH", () => {
  it.each([
    ["Tamil script", "இன்வாய்ஸ் போடுங்க"],
    ["Roman Tamil", "invoice podunga"],
    ["Roman Hindi", "mujhe invoice banana hai"],
  ])("%s → 'create an invoice' → the same flow an English user gets", async (_n, text) => {
    const h = makeHarness();
    const r = await h.say(text);
    expect(r.english).toBe("create an invoice");
    expect(r.kind).toBe("question");
    expect(r.progress).toEqual({ current: 1, total: 4 });
    expect(r.language.original).toBe(text); // the user's own text is what is echoed back
    expect(h.client.translateSpy).toHaveBeenCalled();
  });

  it("END TO END: regional input → pipeline → classifier → slot filling (in Hindi) → summary → pre-filled form", async () => {
    const h = makeHarness();
    const a = await h.say("mujhe invoice banana hai");
    expect(a.kind).toBe("question");
    // reply was routed back through the language layer toward the user's language
    expect(h.client.translateSpy.mock.calls.some((c: any[]) => c[0].target === "hi-IN")).toBe(true);
    const b = await h.say("Acme Industries ke liye");
    expect(h.store.session!.state.slots.customer.value).toEqual({ id: "c2", name: "Acme Industries" });
    expect(b.progress).toEqual({ current: 2, total: 4 });
    await h.say("Silk sarees");
    await h.say("12000");
    await h.say("skip");
    const y = await h.say("haan");
    expect(y.kind).toBe("open_form");
    expect(y.route).toBe("/sales/invoices/new");
    expect(y.prefill).toMatchObject({ customerId: "c2", lineItems: [{ name: "Silk sarees", qty: 1, unitPrice: 12000 }] });
  });

  it("code-mixed mid-slot-filling: 'Acme Industries ke liye, 45000' fills customer AND amount", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    await h.say("Acme Industries ke liye, 45000");
    const s = h.store.session!.state;
    expect(s.slots.customer.display).toBe("Acme Industries");
    expect(s.slots.unitPrice.value).toBe(45000);
  });

  it("language switch mid-conversation: English turn, Hindi turn, English turn — one session", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal");
    const id = h.store.session!.id;
    await h.say("haan"); // Hindi 'yes' while a question is pending — must not fill anything
    expect(h.store.session!.id).toBe(id);
    const r = await h.say("Repairs");
    expect(r.progress!.total).toBe(4);
    expect(h.store.session!.id).toBe(id);
  });

  it("Sarvam FAILS between two questions: session intact, the untranslatable answer is NOT used, user told plainly", async () => {
    let fail = false;
    const h = makeHarness({ translate: (req) => (fail ? { fail: "timeout" } : translator(req)) });
    await h.say("Create an invoice for Kamal, 500");
    const before = JSON.stringify(h.store.session!.state.slots);
    fail = true;
    const r = await h.say("Acme Industries ke liye");
    expect(r.kind).toBe("notice");
    expect(r.message).toContain("couldn't translate");
    expect(r.sessionActive).toBe(true); // the draft is still open
    expect(JSON.stringify(h.store.session!.state.slots)).toBe(before);
    fail = false;
    const ok = await h.say("Repairs");
    expect(ok.progress).toBeDefined();
  });

  it("per-tenant multilingual switch off: regional text is not parsed as an answer (never guessed)", async () => {
    const h = makeHarness({ multilingualDisabled: true });
    await h.say("Create an invoice for Kamal, 500");
    const r = await h.say("Acme Industries ke liye");
    expect(r.kind).toBe("notice");
    expect(h.client.translateSpy).not.toHaveBeenCalled();
    expect(h.store.session!.state.slots.customer.value.id).toBe("c4");
  });

  it("the regional turn is charged against the tenant's AI allowance (no free translation)", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    expect(h.store.charged).toBe(0); // English: no provider, no charge
    await h.say("Acme Industries ke liye");
    expect(h.store.charged).toBeGreaterThan(0);
  });
});
