import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tryAiCreateFlow } from "@/lib/ai/createFlow";
import { shouldConsultTaskFlow } from "@/lib/ai/taskFlowClient";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() };
});
afterEach(() => { vi.unstubAllGlobals(); });

const jsonRes = (body: unknown, ok = true) => ({ ok, json: async () => body }) as any;
const stubFetch = (routes: Record<string, (b: any) => any>) => {
  const f = vi.fn(async (url: string, init: any) => {
    const h = routes[url];
    if (!h) throw new Error(`unexpected fetch ${url}`);
    return jsonRes(h(JSON.parse(init.body)));
  });
  vi.stubGlobal("fetch", f);
  return f;
};

describe("client gate: the English majority path never pays for a round trip", () => {
  it.each([
    ["show me my top customers", false],
    ["show unpaid invoices for last month", false],
    ["what is my cash balance", false],
    ["create an invoice for Acme", true],
    ["How do I create an invoice?", true],
    ["create an invoce", true],
    ["mujhe invoice banana hai", true], // regional → server translates
    ["இன்வாய்ஸ் போடுங்க", true],
    ["请给客户创建发票", false], // unsupported script: nothing to translate
    ["a".repeat(700), false],
  ])("%s → %s", (t, want) => expect(shouldConsultTaskFlow(t, false)).toBe(want));
  it("attachments keep the existing document path", () => expect(shouldConsultTaskFlow("create an invoice", true)).toBe(false));
  it("an active draft consults the server for any reply", () => {
    store.set("aupulens:task-flow-active", "1");
    expect(shouldConsultTaskFlow("Acme Trading", false)).toBe(true);
  });
});

describe("tryAiCreateFlow contract is unchanged", () => {
  it("no fetch at all for an ordinary English message", async () => {
    const f = stubFetch({});
    expect(await tryAiCreateFlow({ text: "what is my balance" })).toEqual({ handled: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("a guided turn comes back as { handled:true, message } and keeps the session flag", async () => {
    stubFetch({ "/api/ai/task-flow": () => ({ handled: true, sessionActive: true, kind: "question", message: "Question 1 of 4 · Customer", english: "create an invoice" }) });
    const r = await tryAiCreateFlow({ text: "create an invoice" });
    expect(r).toEqual({ handled: true, message: "Question 1 of 4 · Customer", route: undefined });
    expect(store.get("aupulens:task-flow-active")).toBe("1");
  });
  it("completed flow: stashes COMPLETE prefill and returns the form route", async () => {
    store.set("aupulens:task-flow-active", "1"); // a draft is open, so the bare reply "yes" is consulted
    stubFetch({ "/api/ai/task-flow": () => ({ handled: true, sessionActive: false, kind: "open_form", message: "Opening…", route: "/sales/invoices/new", target: "invoice", prefill: { customerId: "c1", lineItems: [{ name: "X", qty: 1, unitPrice: 5 }] } }) });
    const r = await tryAiCreateFlow({ text: "yes" });
    expect(r).toMatchObject({ handled: true, route: "/sales/invoices/new" });
    const stash = JSON.parse(store.get("aupulens:ai-prefill")!);
    expect(stash).toMatchObject({ target: "invoice", route: "/sales/invoices/new", data: { customerId: "c1" } });
    expect(store.get("aupulens:task-flow-active")).toBeUndefined();
  });
  it("REGIONAL non-invoice create request: the pipeline's English drives the EXISTING create router", async () => {
    const f = stubFetch({
      "/api/ai/task-flow": () => ({ handled: false, sessionActive: false, kind: "not_handled", message: "", english: "create a new lead named Ravi" }),
      "/api/ai/prefill": (b) => ({ success: true, target: "lead", route: "/crm/leads", data: { lead_name: "Ravi" }, suggestions: [], _seen: b.message }),
    });
    const r = await tryAiCreateFlow({ text: "ravi naam ka naya lead banao" });
    expect(r).toMatchObject({ handled: true, route: "/crm/leads" });
    const prefillCall = f.mock.calls.find((c) => c[0] === "/api/ai/prefill")!;
    expect(JSON.parse((prefillCall[1] as any).body).message).toBe("create a new lead named Ravi"); // English, not the raw Hindi
  });
  it("fails OPEN: task-flow unreachable → legacy behaviour, never an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await tryAiCreateFlow({ text: "mujhe invoice banana hai" })).toEqual({ handled: false });
  });
  it("an expired/absent draft clears the flag so later messages stay local", async () => {
    store.set("aupulens:task-flow-active", "1");
    stubFetch({ "/api/ai/task-flow": () => ({ handled: true, sessionActive: false, kind: "notice", message: "That draft has expired", english: "" }) });
    await tryAiCreateFlow({ text: "Repairs" });
    expect(store.get("aupulens:task-flow-active")).toBeUndefined();
  });
});
