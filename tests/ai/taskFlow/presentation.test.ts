import { describe, it, expect } from "vitest";
import { buildQuickReplies, stripChoiceText } from "@/lib/ai/flowPresentation";

describe("one-tap replies presentation", () => {
  it("choices are sent as their own LABEL, actions as their natural word", () => {
    const q = buildQuickReplies({ choices: ["Acme Trading", 'Create a new customer "Acme"'], actions: [{ label: "Back", value: "back" }, { label: "Cancel", value: "cancel" }] });
    expect(q.map((r) => [r.kind, r.label, r.value])).toEqual([
      ["choice", "Acme Trading", "Acme Trading"], ["choice", 'Create a new customer "Acme"', 'Create a new customer "Acme"'], ["action", "Back", "back"], ["action", "Cancel", "cancel"],
    ]);
  });
  it("removes the typed-answer scaffolding but keeps the question", () => {
    const msg = 'Question 2 of 4 · Item / service\nWhat is being billed?\n1. **Repairs**\n2. **Consulting**\n\nReply with a number, or type the answer.\n\nYou can say "back", "open the form" (skip the questions), or "cancel" at any time.';
    const out = stripChoiceText(msg);
    expect(out).toBe("Question 2 of 4 · Item / service  \nWhat is being billed?"); // hard break so the lines stay on separate lines in markdown
  });
  it("leaves a summary untouched (no numbered choices)", () => {
    const s = "Here is the invoice I'll prepare:\n- Customer: **Kamal**\n- Item: **X**\n\nReply \"yes\" to open…";
    expect(stripChoiceText(s)).toBe(s); // bullets keep their single newlines (markdown list), nothing is dropped
  });
  it("no choices and no actions ⇒ no buttons", () => expect(buildQuickReplies({})).toEqual([]));
});

import { makeHarness } from "./harness";
import { vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/ai/AiLanguageInteraction", () => ({ default: { create: vi.fn(async () => ({})) } }));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordAiUsage: vi.fn(), recordSarvamUsage: vi.fn() }));

describe("clicking a button = sending its label/value: the flow understands every one", () => {
  it("customer choice label, item choice label, 'create a new customer' label, and every action word", async () => {
    const h = makeHarness({ recentItems: ["Repairs", "Consulting"] });
    let r = await h.say("Create an invoice for Acme Traders");
    const labels = buildQuickReplies(r).filter((x) => x.kind === "choice").map((x) => x.value);
    r = await h.say(labels.find((l) => l === "Acme Industries")!);
    expect(h.store.session!.state.slots.customer.value.name).toBe("Acme Industries");
    r = await h.say(buildQuickReplies(r).find((x) => x.value === "Consulting")!.value);
    expect(h.store.session!.state.slots.itemName.value).toBe("Consulting");
    r = await h.say("500");
    for (const a of ["back", "skip", "back"]) r = await h.say(a);
    r = await h.say("cancel");
    expect(r.kind).toBe("cancelled");
    // "Create a new customer" button
    const c = await h.say("Create an invoice for Zorblax");
    const newLabel = buildQuickReplies(c).find((x) => x.value.startsWith("Create a new customer"))!.value;
    const nav = await h.say(newLabel);
    expect(nav.route).toBe("/sales/customers/new");
    expect(nav.prefill).toEqual({ name: "Zorblax" });
  });
  it("'Someone else (type the name)' re-asks the customer", async () => {
    const h = makeHarness();
    const r = await h.say("Create an invoice for Acme Traders");
    const label = buildQuickReplies(r).find((x) => x.value.startsWith("Someone else"))!.value;
    const n = await h.say(label);
    expect(n.message).toContain("type the customer's name");
  });
});
