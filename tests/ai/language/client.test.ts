import { describe, it, expect, vi } from "vitest";
import { createSarvamClient } from "@/lib/ai/language/sarvam/client";

const cfg = (over: Partial<{ apiKey: string; enabled: boolean; timeoutMs: number }> = {}) => () => ({
  enabled: true, apiKey: "sk-secret-123", baseUrl: "https://api.sarvam.test", timeoutMs: 300, ...over,
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const http = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;

describe("Sarvam client: never throws into the caller", () => {
  it("translate success, correct URL/header/body", async () => {
    const f = vi.fn(async () => ok({ translated_text: "hello", source_language_code: "hi-IN" }));
    const c = createSarvamClient({ fetchFn: f as any, config: cfg() });
    const r = await c.translate({ input: "namaste", source: "auto", target: "en-IN", mode: "code-mixed" });
    expect(r.ok && r.data.translatedText).toBe("hello");
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe("https://api.sarvam.test/translate");
    expect(init.headers["api-subscription-key"]).toBe("sk-secret-123");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ input: "namaste", source_language_code: "auto", target_language_code: "en-IN", model: "mayura:v1", mode: "code-mixed" });
  });
  it("no key => not_configured, and fetch is never called", async () => {
    const f = vi.fn();
    const r = await createSarvamClient({ fetchFn: f as any, config: cfg({ apiKey: "" }) }).translate({ input: "x", source: "auto", target: "en-IN" });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
    if (r.ok === false) expect(r.error.kind).toBe("not_configured");
  });
  it("disabled flag => disabled", async () => {
    const r = await createSarvamClient({ fetchFn: vi.fn() as any, config: cfg({ enabled: false }) }).detect("x");
    if (r.ok === false) expect(r.error.kind).toBe("disabled"); else throw new Error("expected failure");
  });
  it("retries once on 5xx then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(http(503)).mockResolvedValueOnce(ok({ translated_text: "hi" }));
    const r = await createSarvamClient({ fetchFn: f as any, config: cfg({ timeoutMs: 2000 }) }).translate({ input: "x", source: "auto", target: "en-IN" });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("does NOT retry a 403 (bad key) or 422", async () => {
    const f = vi.fn(async () => http(403));
    const r = await createSarvamClient({ fetchFn: f as any, config: cfg() }).translate({ input: "x", source: "auto", target: "en-IN" });
    expect(f).toHaveBeenCalledTimes(1);
    if (r.ok === false) { expect(r.error.kind).toBe("http"); expect(r.error.status).toBe(403); } else throw new Error("x");
  });
  it("hard timeout => timeout error, within budget", async () => {
    const f = vi.fn((_u: string, init: any) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" })))));
    const t0 = Date.now();
    const r = await createSarvamClient({ fetchFn: f as any, config: cfg({ timeoutMs: 150 }) }).translate({ input: "x", source: "auto", target: "en-IN" });
    expect(Date.now() - t0).toBeLessThan(600);
    if (r.ok === false) expect(r.error.kind).toBe("timeout"); else throw new Error("x");
  });
  it("network throw => structured error, no throw", async () => {
    const f = vi.fn(async () => { throw new Error("ECONNRESET"); });
    const r = await createSarvamClient({ fetchFn: f as any, config: cfg() }).detect("x");
    expect(r.ok).toBe(false);
  });
  it("nonsense body => bad_response", async () => {
    const f = vi.fn(async () => ok({ nope: true }));
    const r = await createSarvamClient({ fetchFn: f as any, config: cfg() }).translate({ input: "x", source: "auto", target: "en-IN" });
    if (r.ok === false) expect(r.error.kind).toBe("bad_response"); else throw new Error("x");
  });
  it("the API key never appears in any error message", async () => {
    const f = vi.fn(async () => http(500));
    const r = await createSarvamClient({ fetchFn: f as any, config: cfg() }).translate({ input: "x", source: "auto", target: "en-IN" });
    expect(JSON.stringify(r)).not.toContain("sk-secret-123");
  });
  it("over-limit input is rejected locally (no call)", async () => {
    const f = vi.fn();
    const r = await createSarvamClient({ fetchFn: f as any, config: cfg() }).translate({ input: "a".repeat(1001), source: "auto", target: "en-IN" });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("detect + transliterate map fields; speech is an explicit not_implemented", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ language_code: "ta-IN", script_code: "Taml" })).mockResolvedValueOnce(ok({ transliterated_text: "नमस्ते" }));
    const c = createSarvamClient({ fetchFn: f as any, config: cfg() });
    const d = await c.detect("vanakkam");
    expect(d.ok && d.data).toEqual({ language: "ta-IN", script: "Taml" });
    const t = await c.transliterate("namaste", "en-IN", "hi-IN");
    expect(t.ok && t.data.text).toBe("नमस्ते");
    const a = await c.speech.transcribe({ audio: new ArrayBuffer(1) });
    if (a.ok === false) expect(a.error.kind).toBe("not_implemented"); else throw new Error("x");
  });
});
