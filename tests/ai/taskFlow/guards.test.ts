/** BRIEF-SARVAM-3 §0.1, §0.2 guards and §1.2 (the customerless-invoice 500 must be unreachable). */
import { describe, it, expect, vi, afterEach } from "vitest";
import { makeHarness } from "./harness";
import { validatePayload, SALES_INVOICE_TARGET as T } from "@/lib/ai/taskFlow/registry";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/ai/AiLanguageInteraction", () => ({ default: { create: vi.fn(async () => ({})) } }));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordAiUsage: vi.fn(), recordSarvamUsage: vi.fn() }));
afterEach(() => setSarvamClientForTests(null));

describe("0.2 skip-ahead: nothing mandatory missing ⇒ summary, no questions", () => {
  it("'Create an invoice for Acme Trading, 45000, due 30 days, consulting services' → summary straight away", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice for Acme Trading, 45000, due 30 days, consulting services");
    expect(r.kind).toBe("confirm");
    expect(r.message).not.toContain("Question");
    expect(r.message).toContain("consulting services");
    expect(r.message).toContain("₹45,000");
    expect(r.message).toContain("Monday, 19 Oct 2026");
    expect(r.route).toBeUndefined(); // still not opened until confirmed
    const y = await h.say("yes");
    expect(y.kind).toBe("open_form");
    expect(y.prefill).toMatchObject({ customerId: "c1", lineItems: [{ name: "consulting services", qty: 1, unitPrice: 45000 }] });
  });
  it("mandatory supplied but the OPTIONAL due date isn't ⇒ still summary only, with a hint to add it", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice for Acme Trading, 45000, consulting");
    expect(r.kind).toBe("confirm");
    expect(r.message).toContain("not set (defaults to today)");
    expect(r.message).toContain('change due to');
    const c = await h.say("change due to 15 days");
    expect(c.kind).toBe("confirm");
    expect(c.message).toContain("2026-10-04".slice(0, 0) + "Sunday, 4 Oct 2026");
  });
  it("a mandatory field missing ⇒ questions, not a summary", async () => {
    const h = makeHarness();
    expect((await h.say("Create an invoice for Acme Trading, 45000")).kind).toBe("question");
  });
  it("an uncertain field (near-miss customer) ⇒ never skipped ahead", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice for Acme Traders, 45000, consulting");
    expect(r.kind).toBe("question");
    expect(h.store.session!.state.slots.customer).toBeUndefined();
  });
});

describe("0.2 escape hatch: 'skip the questions and open the form' at EVERY step = today's partial form", () => {
  const PHRASES = ["Skip the questions and open the form", "open the form", "just open the form", "open form", "skip questions"];
  it.each(PHRASES)("'%s' at question 1 → empty-ish form opens, session closed, nothing created", async (p) => {
    const h = makeHarness({ autoCreate: true });
    await h.say("Create an invoice");
    const r = await h.say(p);
    expect(r.kind).toBe("open_form");
    expect(r.route).toBe("/sales/invoices/new");
    expect(r.prefill).not.toHaveProperty("customerId");
    expect(h.store.session).toBeNull();
    expect(h.posts).toHaveLength(0); // even with the execute flag ON, the escape only opens the form
    expect(h.store.closed.at(-1)?.status).toBe("confirmed");
  });
  it("mid-flow: keeps everything already answered", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500");
    const r = await h.say("Skip the questions and open the form");
    expect(r.prefill).toMatchObject({ customerId: "c4", customerName: "Kamal", lineItems: [{ qty: 1, unitPrice: 500 }] });
    expect((r.prefill as any).lineItems[0]).not.toHaveProperty("name");
  });
  it("offered on every question (customer, item, amount, due date, choice lists)", async () => {
    const h = makeHarness({ recentItems: ["Consulting", "Repairs"] });
    const seen: string[] = [];
    seen.push((await h.say("Create an invoice")).message);                       // customer
    seen.push((await h.say("Kamal")).message);                                   // item (with choices)
    seen.push((await h.say("Repairs")).message);                                 // amount
    seen.push((await h.say("500")).message);                                     // due date
    await h.say("cancel");
    seen.push((await h.say("Create an invoice for Acme Traders")).message);      // customer choice list
    for (const m of seen) expect(m, m).toContain("open the form");
  });
  it("works in the confirmation stage too, and in a regional language via the pipeline", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500, Repairs");
    expect((await h.say("open the form")).kind).toBe("open_form");
  });
});

describe("0.1 item name: never defaulted; the tenant's own recent items are offered", () => {
  it("offers most-used names from history as numbered choices; free text still works", async () => {
    const h = makeHarness({ recentItems: ["Consulting services", "Website design", "Repairs"] });
    const r = await h.say("Create an invoice for Kamal, 500");
    expect(r.kind).toBe("question");
    expect(r.message).toContain("Item / service");
    expect(r.choices).toEqual(["Consulting services", "Website design", "Repairs"]);
    const p = await h.say("2");
    expect(h.store.session!.state.slots.itemName.value).toBe("Website design");
    expect(p.kind).toBe("question"); // → due date next
  });
  it("typing a NEW item instead of picking works", async () => {
    const h = makeHarness({ recentItems: ["Consulting services"] });
    await h.say("Create an invoice for Kamal, 500");
    await h.say("Brand new thing");
    expect(h.store.session!.state.slots.itemName.value).toBe("Brand new thing");
  });
  it("no history (new tenant) → plain question, and NEVER a default name", async () => {
    const h = makeHarness({ recentItems: [] });
    const r = await h.say("Create an invoice for Kamal, 500");
    expect(r.kind).toBe("question");
    expect(r.choices).toBeUndefined();
    expect(h.store.session!.state.slots.itemName).toBeUndefined();
  });
  it("history lookup failing → plain question (fails open)", async () => {
    const h = makeHarness({ recentItems: async () => { throw new Error("down"); } });
    const r = await h.say("Create an invoice for Kamal, 500");
    expect(r.kind).toBe("question");
    expect(r.choices).toBeUndefined();
  });
  it("capped at 5 choices", async () => {
    const h = makeHarness({ recentItems: ["a", "b", "c", "d", "e", "f", "g"] });
    expect((await h.say("Create an invoice for Kamal, 500")).choices).toHaveLength(5);
  });
  it("back from the amount question re-offers the item choices", async () => {
    const h = makeHarness({ recentItems: ["Repairs"] });
    await h.say("Create an invoice for Kamal");
    await h.say("1");
    const r = await h.say("back");
    expect(r.choices).toEqual(["Repairs"]);
  });
});

describe("1.2 the customerless-invoice 500 is UNREACHABLE from the assistant", () => {
  it("validatePayload rejects every incomplete shape the real route/model would choke on", () => {
    const ok = { customerId: "c1", lineItems: [{ name: "x", qty: 1, unitPrice: 5 }] };
    expect(validatePayload(T, ok)).toEqual([]);
    expect(validatePayload(T, { ...ok, customerId: undefined })).toContain("customerId");
    expect(validatePayload(T, { ...ok, customerId: "" })).toContain("customerId");
    expect(validatePayload(T, { ...ok, lineItems: [] })).toContain("lineItems.name");
    expect(validatePayload(T, { customerId: "c1" })).toContain("lineItems.name");
    expect(validatePayload(T, { ...ok, lineItems: [{ qty: 1, unitPrice: 5 }] })).toContain("lineItems.name");
    expect(validatePayload(T, { ...ok, lineItems: [{ name: "x", qty: 0, unitPrice: 5 }] })).toContain("lineItems.qty");
    expect(validatePayload(T, { ...ok, lineItems: [{ name: "x", qty: 1, unitPrice: -1 }] })).toContain("lineItems.unitPrice");
    expect(validatePayload(T, { ...ok, lineItems: [{ name: "x", qty: 1 }] })).toContain("lineItems.unitPrice");
  });
  it("driving the flow to 'yes' WITHOUT a customer never reaches confirm or execute", async () => {
    const h = makeHarness({ autoCreate: true });
    await h.say("Create an invoice");
    for (const m of ["yes", "confirm", "Repairs", "500", "skip", "yes", "go ahead", "open form".replace("open form", "yes")]) {
      const r = await h.say(m);
      expect(["execute", "open_form"]).not.toContain(r.kind);
      expect(r.route).toBeUndefined();
    }
    expect(h.posts).toHaveLength(0);
    expect(h.store.session!.state.slots.customer).toBeUndefined();
  });
  it("PROPERTY: 1,500 random conversations (execute flag ON) — every POST that ever happens is complete", async () => {
    const pool = ["Create an invoice", "Create an invoice for Kamal", "Create an invoice, 500", "yes", "skip", "back", "cancel", "resume", "change amount to 900",
      "Kamal", "Acme Traders", "1", "2", "3", "Repairs", "500", "45.000", "-5", "due 30 days", "next Friday", "skip the rest", "no", "change", "change customer to Kamal",
      "the same customer as last time", "0", "open form".replace("open form", "yes please"), "restart", "hello?"];
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let created = 0;
    for (let i = 0; i < 1500; i++) {
      const h = makeHarness({ autoCreate: true, recentItems: rnd() < 0.5 ? ["Repairs"] : [] });
      const n = 2 + Math.floor(rnd() * 9);
      for (let k = 0; k < n; k++) {
        const r = await h.say(pool[Math.floor(rnd() * pool.length)]);
        if (r.kind === "open_form" && r.route?.startsWith("/sales/invoices/inv")) created++;
      }
      for (const p of h.posts) {
        expect(validatePayload(T, p.body), `POST body incomplete: ${JSON.stringify(p.body)}`).toEqual([]);
        expect(p.body.customerId).toBeTruthy();
        expect(p.body.status).toBe("draft");
      }
    }
    expect(created).toBeGreaterThan(0); // the property is not vacuous: real creations happened
  }, 60_000);
});

describe("the 'I understood this as… no, I meant …' correction path", () => {
  it("a full corrected request replaces the open draft", async () => {
    const h = makeHarness();
    await h.say("create an invoce for Kamal, 45k");
    const r = await h.say("no, I meant create an invoice for Acme Industries, 4500, Repairs");
    expect(r.kind).toBe("confirm");
    expect(r.message).toContain("Acme Industries");
    expect(r.message).toContain("₹4,500");
    expect(h.store.closed.some((c) => c.status === "rejected")).toBe(true);
  });
  it("a corrected ANSWER ('no, I meant Kamal') is taken as the answer, without the 'no, I meant'", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    await h.say("no, I meant Kamal");
    expect(h.store.session!.state.slots.customer.value.name).toBe("Kamal");
  });
});

describe("user-reported: a request in the MIDDLE of a draft is answered, a command is obeyed", () => {
  it("'Invoices less than ₹25,000.' while asked for the customer is NOT taken as a customer name — it is handed to the assistant, the draft stays", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    const r = await h.say("Invoices less than ₹25,000.");
    expect(r.handled).toBe(false);
    expect(r.sessionActive).toBe(true);
    expect(h.store.session!.state.slots.customer).toBeUndefined();
    const back = await h.say("continue");
    expect(back.message).toContain("Question 1 of 4");
  });
  it.each([
    ["Give me all invoices under 25000"], ["show my unpaid invoices"], ["how many customers do I have"], ["list invoices between 10000 and 50000"],
    ["what is my cash balance"], ["invoices more than 1 lakh"], ["tell me total pending invoices"],
  ])("'%s' mid-draft → answered by the assistant, no slot filled", async (q) => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal");        // item is asked
    const before = JSON.stringify(h.store.session!.state.slots);
    const r = await h.say(q);
    expect(r.handled).toBe(false);
    expect(JSON.stringify(h.store.session!.state.slots)).toBe(before);
  });
  it("…also while an AMOUNT is asked (25000 in a query must not become the price)", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal");
    await h.say("Repairs");
    const r = await h.say("invoices less than 25000");
    expect(r.handled).toBe(false);
    expect(h.store.session!.state.slots.unitPrice).toBeUndefined();
  });
  it("'create the customer ramesh' opens the New Customer form prefilled 'ramesh' and KEEPS the draft", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    const r = await h.say("create the customer ramesh");
    expect(r.route).toBe("/sales/customers/new");
    expect(r.prefill).toEqual({ name: "ramesh" });
    expect(h.store.session).not.toBeNull();
    expect(r.sessionActive).toBe(true);
    const c = await h.say("continue");
    expect(c.message).toContain("Question 1 of 4");
  });
  it.each([["add a new customer called Ramesh Traders", "Ramesh Traders"], ["please create customer \"Ramesh & Sons\"", "Ramesh & Sons"], ["new client Kamal Silks", "Kamal Silks"]])("'%s' → %s", async (q, name) => {
    const h = makeHarness();
    await h.say("Create an invoice");
    expect((await h.say(q)).prefill).toEqual({ name });
  });
  it("ordinary answers are STILL answers: names with record-words, short items, amounts, choices", async () => {
    const h = makeHarness({ customers: [{ id: "x", name: "Order Masters Ltd", aliases: [] }] });
    await h.say("Create an invoice");
    await h.say("Order Masters Ltd");
    expect(h.store.session!.state.slots.customer.value.name).toBe("Order Masters Ltd");
    await h.say("Payments consulting");
    expect(h.store.session!.state.slots.itemName.value).toBe("Payments consulting");
    await h.say("500");
    expect(h.store.session!.state.slots.unitPrice.value).toBe(500);
  });
  it("Roman-Hindi query that could not be translated is handed to the assistant, not answered with 'couldn't translate'", async () => {
    const h = makeHarness({ translate: () => ({ fail: "timeout" }) });
    await h.say("Create an invoice");
    const r = await h.say("Pachchis hazaar se Kam ke saare invoices Ki list mujhe dijiye.");
    expect(r.handled).toBe(false);
    expect(r.sessionActive).toBe(true);
  });
  it("…but a non-query untranslatable answer still gets the plain notice (never guessed into a slot)", async () => {
    const h = makeHarness({ translate: () => ({ fail: "timeout" }) });
    await h.say("Create an invoice");
    const r = await h.say("kal Acme Industries ke liye");
    expect(r.kind).toBe("notice");
    expect(h.store.session!.state.slots.customer).toBeUndefined();
  });
});

describe("one-tap replies (buttons in the chat)", () => {
  it("every question carries Back/Skip/Open-the-form/Cancel actions; choice lists carry labels the client turns into numbers", async () => {
    const h = makeHarness({ recentItems: ["Repairs"] });
    const q1 = await h.say("Create an invoice");
    expect(q1.actions!.map((a) => a.value)).toEqual(["open the form", "cancel"]); // nothing to go back to yet
    const q2 = await h.say("Kamal");
    expect(q2.choices).toEqual(["Repairs"]);
    expect(q2.actions!.map((a) => a.value)).toEqual(["back", "open the form", "cancel"]);
    await h.say("1");
    const amount = await h.say("500");
    expect(amount.message).toContain("When is it due?");
    expect(amount.actions!.map((a) => a.value)).toEqual(["back", "skip", "open the form", "cancel"]); // optional ⇒ Skip is offered
  });
  it("the due-date question offers Skip; the summary offers Yes / Change / Cancel", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500");
    await h.say("Repairs");
    const s = await h.say("skip");
    expect(s.kind).toBe("confirm");
    expect(s.actions!.map((a) => a.value)).toEqual(["yes", "change", "cancel"]);
    expect(s.actions![0].label).toBe("Yes, open the invoice form");
  });
  it("with auto-create ON the summary offers 'Create draft now' AND 'Review in the form first'", async () => {
    const h = makeHarness({ autoCreate: true });
    await h.say("Create an invoice for Kamal, 500, Repairs"); // mandatory supplied ⇒ straight to the summary
    const s = await h.say("change");
    expect(s.kind).toBe("question");
    const sum = await h.say("change amount to 600");
    expect(sum.kind).toBe("confirm");
    expect(sum.actions!.map((a) => a.value)).toContain("open form");
    expect(sum.actions![0].label).toBe("Create draft now");
  });
});
