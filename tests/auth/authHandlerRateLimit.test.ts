import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
const calls = vi.hoisted(() => ({ credentials: vi.fn(async () => new Response("ok")) }));
vi.mock("@/auth", () => ({ handlers: { POST: calls.credentials, GET: vi.fn() } }));
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
import { POST as register } from "@/app/api/auth/register/route";
import { POST as reset } from "@/app/api/auth/password-reset/request/route";
import { POST as confirm } from "@/app/api/auth/password-reset/confirm/route";
import { POST as credentials } from "@/app/api/auth/[...nextauth]/route";
import { RateLimitCounter } from "@/lib/middleware/mongoRateLimitStore";

beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await RateLimitCounter.init(); });
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
const req = (path: string, email: string) => new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });

describe("real auth handler limiter integration with shared MongoDB", () => {
  it.each([
    ["/api/auth/register", register, 5],
    ["/api/auth/password-reset/request", reset, 5],
    ["/api/auth/password-reset/confirm", confirm, 5],
    ["/api/auth/callback/credentials", credentials, 10],
  ] as const)("enforces %s before business processing without Edge middleware", async (path, handler, limit) => {
    await RateLimitCounter.deleteMany({});
    vi.stubEnv("RATE_LIMIT_STORE", "mongo");
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", "false");
    vi.stubEnv("APP_BASE_URL", "https://example.invalid");
    const email = "rate-test@example.invalid";
    for (let i = 0; i < limit; i++) expect((await handler(req(path, email))).status).not.toBe(429);
    const blocked = await handler(req(path, email));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect((await blocked.json()).code).toBe("RATE_LIMITED");
    expect(JSON.stringify(await RateLimitCounter.find({}).lean())).not.toContain(email);
    if (path.endsWith("credentials")) expect(calls.credentials).toHaveBeenCalledTimes(limit);
  });
});
