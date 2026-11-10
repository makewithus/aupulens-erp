import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, UpstashRedisRateLimitStore, UPSTASH_RATE_LIMIT_SCRIPT } from "@/lib/middleware/rateLimit";

/** A tiny Redis emulator that implements exactly the semantics of UPSTASH_RATE_LIMIT_SCRIPT. */
class FakeRedis {
  now = 1_000_000;
  keys = new Map<string, { v: number; exp: number | null }>();
  requests: any[] = [];
  down = false;
  failEvalOnce = false;
  handler = async (_url: any, init: any) => {
    this.requests.push(JSON.parse(init.body));
    if (this.down) return new Response("down", { status: 503 });
    if (this.failEvalOnce) { this.failEvalOnce = false; return new Response("boom", { status: 500 }); }
    const [cmd, ...args] = JSON.parse(init.body);
    if (cmd === "DEL") { this.keys.delete(args[0]); return Response.json({ result: 1 }); }
    if (cmd !== "EVAL") return new Response("unsupported", { status: 400 });
    const [script, , key, windowMs] = args;
    expect(script).toBe(UPSTASH_RATE_LIMIT_SCRIPT);
    let e = this.keys.get(key);
    if (e && e.exp !== null && e.exp <= this.now) { this.keys.delete(key); e = undefined; }
    e = e ?? { v: 0, exp: null };
    e.v += 1; this.keys.set(key, e);
    let ttl = e.exp === null ? -1 : e.exp - this.now;
    if (e.v === 1 || ttl < 0) { e.exp = this.now + Number(windowMs); ttl = Number(windowMs); }
    return Response.json({ result: [e.v, ttl] });
  };
}

let redis: FakeRedis;
const mk = () => new UpstashRedisRateLimitStore("https://fake.upstash.io", "tok");

beforeEach(() => {
  redis = new FakeRedis();
  vi.stubGlobal("fetch", (u: any, i: any) => redis.handler(u, i));
});
afterEach(() => vi.unstubAllGlobals());

describe("G8 — Upstash rate limiter is atomic", () => {
  it("first request creates the counter with a positive TTL in a single round-trip", async () => {
    const r = await mk().increment("a", 60_000, 5);
    expect(r.count).toBe(1);
    expect(r.remaining).toBe(4);
    expect(r.allowed).toBe(true);
    expect(r.resetAt).toBeGreaterThan(Date.now());
    expect(redis.requests).toHaveLength(1);
    expect(redis.requests[0][0]).toBe("EVAL");
    expect(UPSTASH_RATE_LIMIT_SCRIPT).toMatch(/INCR[\s\S]*PEXPIRE/);
  });

  it("sequential increments count up and remaining shrinks to 0, then allowed=false", async () => {
    const s = mk();
    const out = [];
    for (let i = 0; i < 4; i++) out.push(await s.increment("b", 60_000, 3));
    expect(out.map((r) => r.count)).toEqual([1, 2, 3, 4]);
    expect(out.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(out.map((r) => r.allowed)).toEqual([true, true, true, false]);
  });

  it("an expired counter resets to 1 after the window", async () => {
    const s = mk();
    await s.increment("c", 1_000); await s.increment("c", 1_000);
    redis.now += 1_001;
    expect((await s.increment("c", 1_000)).count).toBe(1);
  });

  it("concurrent increments from several independent store instances never lose or duplicate a count", async () => {
    const stores = [mk(), mk(), mk()];
    const rs = await Promise.all(Array.from({ length: 90 }, (_, i) => stores[i % 3].increment("d", 60_000)));
    expect(rs.map((r) => r.count).sort((x, y) => x - y)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
  });

  it("REGRESSION: a failed request cannot leave an immortal counter (previous INCR-then-best-effort-PEXPIRE bug)", async () => {
    const s = mk();
    redis.failEvalOnce = true;
    await expect(s.increment("e", 200)).rejects.toThrow();
    expect(redis.keys.has("rl:e")).toBe(false); // nothing was half-written
    await s.increment("e", 200); await s.increment("e", 200);
    redis.now += 500;
    expect((await s.increment("e", 200)).count).toBe(1); // window elapsed -> counter expired
    for (const e of redis.keys.values()) expect(e.exp).not.toBeNull(); // every key has a TTL
  });

  it("a pre-existing counter with a missing TTL is repaired, not trusted forever", async () => {
    redis.keys.set("rl:f", { v: 41, exp: null });
    const r = await mk().increment("f", 5_000);
    expect(r.count).toBe(42);
    expect(redis.keys.get("rl:f")!.exp).not.toBeNull();
    redis.now += 5_001;
    expect((await mk().increment("f", 5_000)).count).toBe(1);
  });

  it("rejects malformed configuration, windows and responses", async () => {
    expect(() => new UpstashRedisRateLimitStore("not-a-url", "t")).toThrow();
    expect(() => new UpstashRedisRateLimitStore("https://x", "")).toThrow();
    const s = mk();
    await expect(s.increment("g", 0)).rejects.toThrow();
    await expect(s.increment("g", -5)).rejects.toThrow();
    await expect(s.increment("g", 1.5)).rejects.toThrow();
    await expect(s.increment("g", 3 * 86_400_000)).rejects.toThrow();
    redis.handler = async () => Response.json({ result: ["x", -1] });
    await expect(s.increment("g", 1000)).rejects.toThrow(/Invalid/);
  });

  it("reset deletes the counter", async () => {
    const s = mk();
    await s.increment("h", 1000);
    await s.reset("h");
    expect(redis.keys.has("rl:h")).toBe(false);
  });
});

const post = (path: string, email = "u@x.com") =>
  new Request(`http://x${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });

describe("G8 — failure policy", () => {
  it("Redis outage: authentication-sensitive endpoints fail CLOSED with 429 + Retry-After", async () => {
    redis.down = true;
    const res = await checkRateLimit(post("/api/auth/callback/credentials"), "/api/auth/callback/credentials", undefined, mk());
    expect(res?.status).toBe(429);
    expect(res?.headers.get("retry-after")).toBe("3");
    expect((await res!.json()).code).toBe("RATE_LIMIT_SERVICE_UNAVAILABLE");
  });

  it("Redis outage: ordinary endpoints fail OPEN", async () => {
    redis.down = true;
    expect(await checkRateLimit(post("/api/crm/search"), "/api/crm/search", undefined, mk())).toBeNull();
  });

  it("over-limit returns 429 with correct Retry-After and remaining headers", async () => {
    const store = mk();
    let res: Response | null = null;
    for (let i = 0; i < 31; i++) res = await checkRateLimit(post("/api/crm/search"), "/api/crm/search", undefined, store);
    expect(res?.status).toBe(429);
    expect(Number(res!.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(res!.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    expect(res!.headers.get("x-ratelimit-limit")).toBe("30");
    expect(res!.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  it("malformed Upstash configuration: auth routes fail closed, ordinary routes fail open", async () => {
    const orig = { u: process.env.UPSTASH_REDIS_REST_URL, t: process.env.UPSTASH_REDIS_REST_TOKEN };
    process.env.UPSTASH_REDIS_REST_URL = "garbage"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    try {
      expect((await checkRateLimit(post("/api/auth/callback/credentials"), "/api/auth/callback/credentials"))?.status).toBe(429);
      expect(await checkRateLimit(post("/api/crm/search"), "/api/crm/search")).toBeNull();
    } finally {
      if (orig.u === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = orig.u;
      if (orig.t === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = orig.t;
    }
  });
});
