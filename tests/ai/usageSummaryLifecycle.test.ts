// Lightweight lifecycle harness using the installed Vitest tools; no DOM test dependency.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ effect: undefined as undefined | (() => (() => void) | void), state: vi.fn(), session: { user: { tenantId: "org-a", id: "user-a" } } }));
vi.mock("react", () => ({ useEffect: (fn: () => (() => void) | void) => { m.effect = fn; }, useState: () => [{}, m.state] }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: m.session }) }));
import { useAiUsageSummary, refreshAiUsage } from "@/lib/hooks/useAiUsageSummary";
import { emptyUsage, usageMetric } from "@/lib/ai/usagePolicy";
const timestamp = "2026-10-15T00:00:00Z";
const summary = () => ({ session: usageMetric(1, 10, new Date(timestamp), new Date("2026-10-15T00:01:00Z")), weekly: emptyUsage("unconfigured"), monthly: emptyUsage("unconfigured"), serverTime: timestamp });
let cleanup: (() => void) | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  m.state.mockReset();
  const browser = new EventTarget();
  Object.assign(browser, { setInterval, clearInterval });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: summary() }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => { cleanup?.(); await settle(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function HookHarness() { useAiUsageSummary(); cleanup = m.effect!() || undefined; }
describe("usage countdown and invalidation lifecycle", () => {
  it("keeps the last known credit windows when a refresh omits credit-window data", async () => {
    const windows = {
      session: { used: 6.38, reserved: 0, limit: 500, remaining: 493.62, startsAt: timestamp, resetsAt: "2026-10-15T05:00:00Z", unit: "credits" as const },
      weekly: { used: 6.38, reserved: 0, limit: 3000, remaining: 2993.62, startsAt: timestamp, resetsAt: "2026-10-19T00:00:00Z", unit: "credits" as const },
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { ...summary(), credits: { planKey: "pro", windows }, serverTime: timestamp } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { ...summary(), serverTime: timestamp } }) });
    HookHarness(); await settle();
    refreshAiUsage(); await settle();
    expect(m.state.mock.lastCall?.[0].data.credits.windows).toEqual(windows);
  });

  it("refreshes on request completion, reconnect and visibility, then cleans up all listeners", async () => {
    HookHarness(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    refreshAiUsage(); await settle();
    window.dispatchEvent(new Event("online")); await settle();
    document.dispatchEvent(new Event("visibilitychange")); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    cleanup?.(); cleanup = undefined;
    refreshAiUsage(); window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("advances countdown using server time and refreshes an expired window", async () => {
    HookHarness(); await settle();
    await vi.advanceTimersByTimeAsync(15000);
    expect(m.state.mock.lastCall?.[0].now).toBe(Date.parse(timestamp) + 15000);
    await vi.advanceTimersByTimeAsync(45000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("replaces failures with unavailable and never fabricates usage", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    HookHarness(); await settle();
    expect(m.state).toHaveBeenCalledWith(expect.objectContaining({ unavailable: true }));
    expect(m.state.mock.lastCall?.[0].data).toBeUndefined();
  });
  it("does not update state after unmounting during a slow response", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise(r => { resolve = r; }));
    HookHarness(); cleanup?.(); cleanup = undefined;
    resolve({ ok: true, json: async () => ({ success: true, data: summary() }) });
    await settle(); expect(m.state).not.toHaveBeenCalled();
  });
  it("coalesces requests without losing a completion that arrives during a fetch", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    HookHarness(); refreshAiUsage(); refreshAiUsage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve({ ok: true, json: async () => ({ success: true, data: summary() }) });
    await settle(); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("pauses reads in hidden tabs and refreshes on return", async () => {
    Object.assign(document, { visibilityState: "hidden" });
    HookHarness(); await settle(); expect(fetchMock).not.toHaveBeenCalled();
    Object.assign(document, { visibilityState: "visible" });
    document.dispatchEvent(new Event("visibilitychange")); await settle(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("refreshes a near reset boundary promptly after a successful read", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { ...summary(), session: { ...summary().session, resetsAt: "2026-10-15T00:00:05Z" } } }) });
  HookHarness(); await settle();
  await vi.advanceTimersByTimeAsync(15000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("polls healthy usage so requests from other workspace users become visible", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { ...summary(), session: emptyUsage("unconfigured") } }) });
  HookHarness(); await settle();
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
