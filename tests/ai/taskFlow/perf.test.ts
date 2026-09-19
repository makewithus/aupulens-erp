import { describe, it, expect, vi, afterEach } from "vitest";
import { makeHarness } from "./harness";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/ai/AiLanguageInteraction", () => ({ default: { create: vi.fn(async () => ({})) } }));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordAiUsage: vi.fn(), recordSarvamUsage: vi.fn() }));
afterEach(() => setSarvamClientForTests(null));

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
async function turns(n: number, run: (i: number) => Promise<unknown>) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); await run(i); out.push(performance.now() - t); }
  return out;
}

/** Our own per-turn overhead (provider mocked at 0 ms, in-memory session + customer lookups). Budget: < 1s/turn. */
describe("clarifying-question turn latency (layer + engine + session logic, excluding network/DB round-trips)", () => {
  it("English turn: p95 well under 1s", async () => {
    const h = makeHarness();
    const s = await turns(300, async (i) => {
      await h.say("Create an invoice");
      await h.say("Kamal");
      await h.say(`Item ${i}`);
      await h.say("500");
      await h.say("cancel");
    });
    console.log(`[perf] task-flow english turn(s) x5 p50=${pct(s, 0.5).toFixed(3)}ms p95=${pct(s, 0.95).toFixed(3)}ms`);
    expect(pct(s, 0.95)).toBeLessThan(1000);
  });
  it("Regional turn, uncached reply translation, mocked provider: p95 < 1s", async () => {
    const s = await turns(200, async (i) => {
      const h = makeHarness();
      await h.say(`mujhe invoice banana hai`);
      await h.say(`Acme Industries ke liye ${i}`);
    });
    console.log(`[perf] task-flow regional 2 turns p95=${pct(s, 0.95).toFixed(3)}ms`);
    expect(pct(s, 0.95)).toBeLessThan(1000);
  });
  it("Regional turn, reply translation cached: fewer provider calls on repeat", async () => {
    const h = makeHarness();
    await h.say("mujhe invoice banana hai");
    const first = h.client.translateSpy.mock.calls.length;
    await h.say("cancel");
    await h.say("mujhe invoice banana hai"); // same question template again
    const second = h.client.translateSpy.mock.calls.length - first;
    console.log(`[perf] provider calls: first turn ${first}, repeat ${second}`);
    expect(second).toBeLessThan(first + 3);
  });
});
