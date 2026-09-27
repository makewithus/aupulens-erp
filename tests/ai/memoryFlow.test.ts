import { afterEach, describe, expect, it, vi } from "vitest";
import { tryAiMemoryFlow } from "@/lib/ai/memoryFlow";
import { classifyIntent } from "@/lib/ai/taskFlow/parse";

vi.mock("@/lib/ai/taskFlowClient", () => ({
  runTaskFlow: vi.fn(async () => ({ outcome: null, english: "Give me all those invoices whose prices are more than 20000 and arrived last month" })),
}));
afterEach(() => vi.unstubAllGlobals());

describe("automated record lookup routing", () => {
  it.each([
    "Give me all those invoices whose prices are more than 20000 and arrived last month",
    "Give me those invoices above 20000",
    "I want invoices from last month",
  ])("does not start creation for %s", (text) => {
    expect(classifyIntent(text, /\binvoices?\b/i)).toBe("none");
  });
  it("still creates an explicitly requested invoice", () => {
    expect(classifyIntent("create an invoice for 20000", /\binvoices?\b/i)).toBe("do");
  });
  it("executes an amount-only follow-up with the previous date context", async () => {
    const history = [{ role: "user", content: "Give me invoices above 20000 last month" }, { role: "assistant", content: "No invoices found last month above 20000" }];
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => ({ success: true, handled: true, route: "/sales/invoices?amountMin=10000&dateFrom=2026-08-01&dateTo=2026-08-31" }) }));
    vi.stubGlobal("fetch", fetcher);
    expect(await tryAiMemoryFlow({ text: "greater than 10000?", history })).toMatchObject({ handled: true, route: expect.stringContaining("amountMin=10000") });
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({ text: "greater than 10000?", history });
  });
  it("routes regional requests using translated intent", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => ({ success: true, handled: true, route: "/sales/invoices?amountMin=20000" }) }));
    vi.stubGlobal("fetch", fetcher);
    expect(await tryAiMemoryFlow({ text: "मुझे पिछले महीने के सारे इनवॉइस दिखाओ" })).toMatchObject({ handled: true });
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string).text).toContain("invoices");
  });
  it("does not invent record context for a cold amount-only message", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await tryAiMemoryFlow({ text: "greater than 10000?" })).toEqual({ handled: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports execution failure instead of falling back to directions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await tryAiMemoryFlow({ text: "show invoices" })).toMatchObject({ handled: true, message: expect.stringContaining("couldn't complete") });
  });
});
