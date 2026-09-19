import { describe, it, expect, vi, afterEach } from "vitest";
import { makeHarness } from "./harness";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/ai/AiLanguageInteraction", () => ({ default: { create: vi.fn(async () => ({})) } }));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordAiUsage: vi.fn(), recordSarvamUsage: vi.fn() }));
afterEach(() => setSarvamClientForTests(null));

describe("1.2 explain / do / ask", () => {
  it("EXPLAIN: 'How do I create an invoice?' — steps, no form, no session, nothing created", async () => {
    const h = makeHarness();
    const r = await h.say("How do I create an invoice?");
    expect(r.kind).toBe("explain");
    expect(r.message).toContain("Sales → Invoices → New Invoice");
    expect(r.route).toBeUndefined();
    expect(r.prefill).toBeUndefined();
    expect(r.sessionActive).toBe(false);
    expect(h.store.session).toBeNull();
    expect(h.posts).toHaveLength(0);
  });
  it("DO: everything present but the required item name → one question, then summary", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice for Acme Trading, 45000, due 30 days");
    expect(r.kind).toBe("question");
    expect(r.progress).toEqual({ current: 4, total: 4 });
    expect(r.message).toContain("Item / service");
    const s = h.store.session!.state;
    expect(s.slots.customer.value).toEqual({ id: "c1", name: "Acme Trading" });
    expect(s.slots.unitPrice.value).toBe(45000);
    expect(s.slots.dueDate.value).toBe("2026-10-19");
    const r2 = await h.say("Consulting");
    expect(r2.kind).toBe("confirm");
    expect(r2.message).toContain("₹45,000");
    expect(r2.message).toContain("Monday, 19 Oct 2026");
    expect(r2.route).toBeUndefined(); // the form is NOT opened until the user confirms
  });
  it("ASK: 'Create an invoice' → Q1 of 4, one question at a time, with progress", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice");
    expect(r.kind).toBe("question");
    expect(r.progress).toEqual({ current: 1, total: 4 });
    expect(r.message).toContain("Who is this invoice for?");
    expect(r.message.split("Question").length).toBe(2); // exactly one question, never a form dump
    const r2 = await h.say("Kanchipuram Silks Pvt Ltd");
    expect(r2.progress).toEqual({ current: 2, total: 4 });
    const r3 = await h.say("Silk sarees");
    expect(r3.progress).toEqual({ current: 3, total: 4 });
    const r4 = await h.say("12000");
    expect(r4.progress).toEqual({ current: 4, total: 4 });
    expect(r4.message).toContain("When is it due?");
    const r5 = await h.say("skip");
    expect(r5.kind).toBe("confirm");
    const r6 = await h.say("yes");
    expect(r6.kind).toBe("open_form");
    expect(r6.route).toBe("/sales/invoices/new");
    expect(r6.prefill).toMatchObject({ customerId: "c3", customerName: "Kanchipuram Silks Pvt Ltd", lineItems: [{ name: "Silk sarees", qty: 1, unitPrice: 12000 }] });
    expect(h.store.session).toBeNull();
    expect(h.store.closed.at(-1)?.status).toBe("confirmed");
  });
  it.each([
    ["Can I create an invoice without a customer?"],
    ["invoice creation"],
    ["Creating an invoice"],
  ])("AMBIGUOUS '%s' → asks which they meant, opens nothing", async (q) => {
    const h = makeHarness();
    const r = await h.say(q);
    expect(r.kind).toBe("ask_intent");
    expect(r.route).toBeUndefined();
    expect(h.store.session?.state.stage).toBe("intent");
    const e = await h.say("1");
    expect(e.kind).toBe("explain");
    expect(h.store.session).toBeNull();
  });
  it("ambiguous → '2' proceeds to the questions", async () => {
    const h = makeHarness();
    await h.say("Can I create an invoice?");
    const r = await h.say("2");
    expect(r.kind).toBe("question");
    expect(r.progress).toEqual({ current: 1, total: 4 });
  });
  it("a non-invoice message is not handled (existing flows untouched)", async () => {
    const h = makeHarness();
    const r = await h.say("show me my top customers this month");
    expect(r.handled).toBe(false);
    expect(h.client.translateSpy).not.toHaveBeenCalled();
  });
});

describe("1.3 slot filling", () => {
  it("multi-answer 'Acme Trading, 45000, next Friday' fills three slots and skips ahead", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    const r = await h.say("Acme Trading, 45000, next Friday");
    const s = h.store.session!.state;
    expect(s.slots.customer.display).toBe("Acme Trading");
    expect(s.slots.unitPrice.value).toBe(45000);
    expect(s.slots.dueDate.value).toBe("2026-09-25");
    expect(r.progress).toEqual({ current: 4, total: 4 }); // three answered, one left
    expect(r.message).toContain("Item / service");
  });
  it("back / change earlier answer / skip optional / cancel", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500");
    await h.say("Repairs");
    const back = await h.say("back");
    expect(back.message).toContain("going back");
    expect(h.store.session!.state.slots.itemName).toBeUndefined();
    await h.say("Servicing");
    const c = await h.say("skip");
    expect(c.kind).toBe("confirm");
    const ch = await h.say("change amount to 750");
    expect(ch.kind).toBe("confirm");
    expect(ch.message).toContain("₹750");
    const cancel = await h.say("cancel");
    expect(cancel.kind).toBe("cancelled");
    expect(h.store.session).toBeNull();
    expect(h.posts).toHaveLength(0);
    expect(h.store.closed.at(-1)?.status).toBe("rejected");
  });
  it("a required slot cannot be skipped", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    const r = await h.say("skip");
    expect(r.message).toContain("required");
    expect(h.store.session!.state.slots.customer).toBeUndefined();
  });
  it("'same customer as last time' resolves against real data and says where it came from", async () => {
    const h = makeHarness({ last: { id: "c3", name: "Kanchipuram Silks Pvt Ltd", aliases: [] } });
    await h.say("Create an invoice for the same customer as last time");
    const s = h.store.session!.state;
    expect(s.slots.customer.value).toEqual({ id: "c3", name: "Kanchipuram Silks Pvt Ltd" });
    expect(s.slots.customer.note).toContain("most recent invoice");
  });
  it("'same customer' with no previous invoice says so instead of guessing", async () => {
    const h = makeHarness({ last: null });
    const r = await h.say("Create an invoice for the same customer as last time");
    expect(r.message).toContain("no previous invoice");
    expect(h.store.session!.state.slots.customer).toBeUndefined();
  });
  it("unrelated question mid-flow: draft stays open, caller answers, flow continues afterwards", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal");
    const q = await h.say("what is my cash balance?");
    expect(q.handled).toBe(false);
    expect(q.sessionActive).toBe(true);
    expect(h.store.session).not.toBeNull();
    const back = await h.say("continue");
    expect(back.kind).toBe("question");
  });
  it("answering a question with a question does not fill the slot", async () => {
    const h = makeHarness();
    await h.say("Create an invoice");
    const r = await h.say("who are my customers?");
    expect(r.handled).toBe(false);
    expect(h.store.session!.state.slots.customer).toBeUndefined();
  });
  it("change of mind mid-task: new complete request replaces the open draft", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500");
    const first = h.store.session!.id;
    await h.say("Create an invoice for Acme Industries, 900");
    expect(h.store.closed.find((c) => c.id === first)?.status).toBe("rejected");
    expect(h.store.session!.state.slots.customer.display).toBe("Acme Industries");
  });
  it("abandon and return: the draft is still there and resumes; after the TTL it expires cleanly", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 500");
    const back = await h.say("resume");
    expect(back.kind).toBe("question");
    h.store.session = null; // TTL removed it
    const gone = await h.say("Repairs", { expectSession: true });
    expect(gone.message).toContain("expired");
    expect(gone.handled).toBe(true);
    expect(gone.sessionActive).toBe(false);
  });
  it("tenant with zero customers → says so and offers the New Customer form (no dead end)", async () => {
    const h = makeHarness({ customers: [] });
    const r = await h.say("Create an invoice");
    expect(r.kind).toBe("no_customers");
    expect(r.route).toBe("/sales/customers/new");
    expect(h.store.session).toBeNull();
  });
  it("answer fails validation: quantity 0, negative/zero amount, past date, junk date", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, Repairs");
    expect((await h.say("change quantity to 0")).message).toContain("at least 1");
    expect((await h.say("change amount to 0")).message).toContain("couldn't read");
    expect((await h.say("change amount to -500")).message).toContain("couldn't read");
    const d = await h.say("due 01/01/2020");
    expect(d.message).toMatch(/past|unusual|read that as a date/);
    expect(h.store.session!.state.slots.dueDate).toBeUndefined();
    expect((await h.say("due 2062-01-01")).message).toContain("couldn't read");
  });
});

describe("1.5 confirmation and the two paths", () => {
  const drive = async (h: ReturnType<typeof makeHarness>) => {
    const out: any[] = [];
    for (const m of ["Create an invoice for Kamal, 500", "Repairs", "skip", "yes"]) out.push(await h.say(m));
    return out;
  };
  it("flag OFF (default): 'yes' opens the pre-filled form; the route is never called", async () => {
    const h = makeHarness();
    const out = await drive(h);
    expect(out.at(-1).kind).toBe("open_form");
    expect(out.at(-1).route).toBe("/sales/invoices/new");
    expect(h.posts).toHaveLength(0);
  });
  it("flag explicitly false is byte-identical to flag absent", async () => {
    const a = await drive(makeHarness());
    const b = await drive(makeHarness({ autoCreate: false }));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
  it("flag ON: summary offers create/open-form, 'yes' goes THROUGH THE EXISTING ROUTE as a DRAFT with the caller's cookie, then redirects to the record", async () => {
    const h = makeHarness({ autoCreate: true });
    const out = await drive(h);
    expect(out[2].message).toContain("as a draft now");
    const last = out.at(-1);
    expect(last.route).toBe("/sales/invoices/inv123");
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0].url).toBe("http://x/api/sales/invoices");
    expect(h.posts[0].cookie).toBe("session=abc");
    expect(h.posts[0].body).toMatchObject({ status: "draft", customerId: "c4", lineItems: [{ name: "Repairs", qty: 1, unitPrice: 500 }] });
    expect(h.store.closed.at(-1)).toMatchObject({ status: "executed", ref: "inv123" });
  });
  it("flag ON but user says 'open form' → form, no creation", async () => {
    const h = makeHarness({ autoCreate: true });
    for (const m of ["Create an invoice for Kamal, 500", "Repairs", "skip"]) await h.say(m);
    const r = await h.say("open form");
    expect(r.route).toBe("/sales/invoices/new");
    expect(h.posts).toHaveLength(0);
  });
  it("flag ON, route rejects: plain-language failure, ALL answers kept, retry possible", async () => {
    const h = makeHarness({ autoCreate: true, postResponse: { status: 400, json: { success: false, message: "Missing Chart of Accounts entry" } } });
    const out = await drive(h);
    const last = out.at(-1);
    expect(last.message).toContain("couldn't create the invoice");
    expect(last.message).toContain("Missing Chart of Accounts entry");
    expect(last.message).toContain("saved");
    expect(last.sessionActive).toBe(true);
    expect(h.store.session!.state.slots.itemName.value).toBe("Repairs");
    const openIt = await h.say("open form");
    expect(openIt.prefill).toMatchObject({ customerId: "c4" });
  });
  it("flag ON, route says 403: refused plainly, nothing created", async () => {
    const h = makeHarness({ autoCreate: true, postResponse: { status: 403, json: {} } });
    const out = await drive(h);
    expect(out.at(-1).message).toContain("permission");
  });
  it("respects roles: hr cannot start an invoice flow; middleware-style 403 from the real route also refuses", async () => {
    const hr = makeHarness({ role: "hr" });
    const r = await hr.say("Create an invoice for Kamal");
    expect(r.kind).toBe("refused");
    expect(r.message).toContain("don't have access");
    expect(hr.store.session).toBeNull();
    const err = makeHarness({ lookupThrows: new (await import("@/lib/ai/taskFlow/http")).FlowAccessError("forbidden") });
    const r2 = await err.say("Create an invoice for Kamal");
    expect(r2.kind).toBe("refused");
  });
  it("the summary shows every field; amounts unchanged in value; the user's original text is returned untouched", async () => {
    const h = makeHarness();
    await h.say("Create an invoice for Kamal, 45k");
    await h.say("Repairs");
    const r = await h.say("skip");
    expect(r.language.original).toBe("skip");
    for (const label of ["Customer", "Item / service", "Quantity", "Amount (unit price)", "Subtotal"]) expect(r.message).toContain(label);
    expect(r.message).toContain("₹45,000");
  });
});
