import { describe, it, expect, vi, afterEach } from "vitest";
import { makeHarness, translator, CUSTOMERS } from "./harness";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/ai/AiLanguageInteraction", () => ({ default: { create: vi.fn(async () => ({})) } }));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordAiUsage: vi.fn(), recordSarvamUsage: vi.fn() }));
afterEach(() => setSarvamClientForTests(null));

/** 4.2 — what input would make this open a form pre-filled with the WRONG customer or amount, confidently? */
const noCustomer = (h: ReturnType<typeof makeHarness>) => expect(h.store.session?.state.slots.customer).toBeUndefined();

describe("adversarial: the wrong CUSTOMER", () => {
  it("'Acme Traders' does not exist but 'Acme Trading' and 'Acme Industries' do → CHOICES, never auto-picked", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice for Acme Traders, 500");
    expect(r.kind).toBe("question");
    noCustomer(h);
    expect(r.choices).toEqual(expect.arrayContaining(["Acme Trading", "Acme Industries", 'Create a new customer "Acme Traders"']));
    expect(r.prefill).toBeUndefined();
  });
  it("…and the user's pick, by number, is what is used", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice for Acme Traders, 500");
    const idx = r.choices!.indexOf("Acme Industries") + 1;
    await h.say(String(idx));
    expect(h.store.session!.state.slots.customer.value).toEqual({ id: "c2", name: "Acme Industries" });
  });
  it("a TRANSLATOR that rewrites the typed name into a different real customer is not trusted", async () => {
    const swap = (req: any) => ({ text: req.input.replace(/acme traders ke liye invoice banao/i, "create an invoice for Acme Trading") });
    const h = makeHarness({ translate: swap });
    const r = await h.say("acme traders ke liye invoice banao"); // lowercase: not protected as a name
    expect(r.english).toBe("create an invoice for Acme Trading");
    noCustomer(h); // exact match exists, but it is NOT what the user typed → must confirm
    expect(r.choices).toContain("Acme Trading");
    expect(r.choices).not.toContain('Create a new customer "Acme Trading"'); // never offer to create a name the user didn't type
  });
  it("the pipeline keeps a typed Title-Case name verbatim through translation (no swap possible)", async () => {
    const swap = (req: any) => ({ text: translator(req).text + " Acme Trading" }); // provider appends a different customer
    const h = makeHarness({ translate: swap });
    const r = await h.say("Acme Industries ke liye invoice banao");
    expect(r.language.degraded || r.english.includes("Acme Industries")).toBe(true);
    // whatever happened, "Acme Trading" (c1) must not be the selected customer
    expect(h.store.session?.state.slots.customer?.value?.id).not.toBe("c1");
  });
  it("two customers with the IDENTICAL name → choices, not the first one", async () => {
    const h = makeHarness({ customers: [{ id: "a", name: "Acme", aliases: ["Acme"] }, { id: "b", name: "Acme", aliases: ["Acme"] }] });
    const r = await h.say("Create an invoice for Acme, 500");
    noCustomer(h);
    expect(r.choices!.filter((c) => c === "Acme")).toHaveLength(2);
  });
  it("a customer NAME that is also a misspelling ('Invoce Traders') is matched as typed, not 'corrected'", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Invoce Traders, 500");
    expect(h.store.session!.state.slots.customer.value).toEqual({ id: "c5", name: "Invoce Traders" });
  });
  it("a person's name that is also a Hindi word ('Kamal') resolves exactly", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500");
    expect(h.store.session!.state.slots.customer.value.id).toBe("c4");
  });
  it("an unknown customer offers to CREATE (never invents one) and the choice opens the customer form", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice for Zorblax Corp, 500");
    noCustomer(h);
    const idx = r.choices!.findIndex((c) => c.startsWith("Create a new customer")) + 1;
    const c = await h.say(String(idx));
    expect(c.route).toBe("/sales/customers/new");
    expect(c.prefill).toEqual({ name: "Zorblax Corp" });
  });
});

describe("adversarial: the wrong AMOUNT", () => {
  const amt = async (text: string) => { const h = makeHarness(); const r = await h.say(`Create an invoice for Kamal, ${text}`); return { h, r }; };
  it("'45.000' (decimal or thousands?) → asks, never picks", async () => {
    const { h, r } = await amt("45.000");
    expect(h.store.session!.state.slots.unitPrice).toBeUndefined();
    expect(r.choices).toEqual(["₹45,000", "₹45"]);
  });
  it.each([["4,5000"], ["45OOO"], ["4 5000"]])("'%s' is not read as any amount", async (t) => {
    const { h } = await amt(t);
    expect(h.store.session!.state.slots.unitPrice).toBeUndefined();
  });
  it("two bare numbers → asks which is the amount", async () => {
    const { h, r } = await amt("500 600");
    expect(h.store.session!.state.slots.unitPrice).toBeUndefined();
    expect(r.choices).toEqual(["₹500", "₹600"]);
  });
  it("'200 x 5' reads two ways → asks, never guesses qty vs price", async () => {
    const { h, r } = await amt("200 x 5");
    expect(h.store.session!.state.slots.unitPrice).toBeUndefined();
    expect(h.store.session!.state.slots.quantity.isDefault).toBe(true);
    expect(r.message).toContain("two ways");
  });
  it("'5 x 200' is fine only with an explicit unit word: '5 units at 200'", async () => {
    const { h } = await amt("5 units, amount 200");
    expect(h.store.session!.state.slots.quantity.value).toBe(5);
    expect(h.store.session!.state.slots.unitPrice.value).toBe(200);
  });
  it("a negative sign is never dropped ('-500' must not become 500)", async () => {
    const { h } = await amt("-500");
    expect(h.store.session!.state.slots.unitPrice).toBeUndefined();
  });
  it("absurdly large amounts need explicit confirmation (1.5 crore)", async () => {
    const { h, r } = await amt("1.5 crore");
    expect(h.store.session!.state.slots.unitPrice).toBeUndefined();
    expect(r.message).toContain("very large");
  });
  it.each([["45k", 45000], ["1.5 lakh", 150000], ["forty five thousand", 45000], ["Rs. 45,000/-", 45000], ["₹4.5k", 4500], ["1,00,000", 100000]])("'%s' → exactly %d", async (t, v) => {
    const { h } = await amt(t);
    expect(h.store.session!.state.slots.unitPrice.value).toBe(v);
  });
  it("a provider that changes the amount in translation degrades: nothing is filled from the translated text", async () => {
    const bad = (req: any) => ({ text: translator(req).text.replace("45000", "54000") });
    const h = makeHarness({ translate: bad });
    await h.say("Create an invoice for Kamal");
    const r = await h.say("Repairs ke liye kal 45000");
    expect(h.store.session!.state.slots.unitPrice).toBeUndefined();
    expect(r.kind).toBe("notice");
  });
  it("the summary always shows the amount in ₹ grouped so a decimal shift is visible", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 4500");
    const r = await h.say("Repairs");
    await h.say("skip");
    expect(h.store.session!.state.slots.unitPrice.value).toBe(4500);
    expect(r.message).toContain("due");
  });
});

describe("adversarial: the wrong DATE", () => {
  const due = async (text: string) => { const h = makeHarness(); await h.say("Create an invoice for Kamal, 500"); await h.say("Repairs"); const r = await h.say(`due ${text}`); return { h, r }; };
  it("'next Friday' shows the absolute date AND that it could mean another Friday", async () => {
    const { h } = await due("next Friday");
    const s = h.store.session!.state.slots.dueDate;
    expect(s.value).toBe("2026-09-25");
    expect(s.note).toContain("can mean the coming one or the one after");
  });
  it("no year given and the date has passed → next year, flagged", async () => {
    const { h } = await due("15 Jan");
    expect(h.store.session!.state.slots.dueDate.value).toBe("2027-01-15");
    expect(h.store.session!.state.slots.dueDate.note).toContain("next year");
  });
  it("dd/mm ambiguity is flagged; a two-digit past year is refused; a wild year is refused", async () => {
    expect((await due("12/10/2026")).h.store.session!.state.slots.dueDate.note).toContain("day/month");
    expect((await due("30/09/25")).h.store.session!.state.slots.dueDate).toBeUndefined();
    expect((await due("30/09/2062")).h.store.session!.state.slots.dueDate).toBeUndefined();
    expect((await due("31/02/2026")).h.store.session!.state.slots.dueDate).toBeUndefined();
  });
  it("'30/9' (no year) is not guessed", async () => {
    expect((await due("30/9")).h.store.session!.state.slots.dueDate).toBeUndefined();
  });
  it("'agle mangalwar' (next Tuesday) arrives through the pipeline and is shown as an absolute date", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500");
    await h.say("Repairs");
    await h.say("agle mangalwar");
    expect(h.store.session!.state.slots.dueDate.value).toBe("2026-09-22");
  });
});

describe("adversarial: protected text passes through to the form unchanged", () => {
  it("an invoice-number lookalike and a quoted deliberate typo survive into the line item", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500");
    await h.say('item "Reciept Pad INV-0O42"');
    expect(h.store.session!.state.slots.itemName.value).toBe("Reciept Pad INV-0O42");
    await h.say("skip");
    const y = await h.say("yes");
    expect((y.prefill as any).lineItems[0].name).toBe("Reciept Pad INV-0O42");
  });
  it("nothing is ever filled from a message that is a question", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    await h.say("what should the amount be?");
    expect(h.store.session!.state.slots.customer).toBeUndefined();
    expect(CUSTOMERS.length).toBeGreaterThan(0);
  });
});
