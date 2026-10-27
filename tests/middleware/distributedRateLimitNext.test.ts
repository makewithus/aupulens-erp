import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest } from "next/server";
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
import { POST } from "@/app/api/internal/rate-limit/route";
import { HttpRateLimitStore, checkRateLimit, setRateLimitStore } from "@/lib/middleware/rateLimit";
import { MongoRateLimitStore, RateLimitCounter } from "@/lib/middleware/mongoRateLimitStore";
let server: Server, endpoint: string;
const secret = "synthetic-internal-test-secret";
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!); await RateLimitCounter.init();
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const response = await POST(new NextRequest(endpoint, { method: "POST", headers: req.headers as any, body: Buffer.concat(chunks).toString() }));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as any).port}/api/internal/rate-limit`;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
describe("AUP-007: real shared backend and asynchronous enforcement", () => {
  it("counts concurrent calls from independent Node processes in one atomic persisted window", async () => {
    vi.stubEnv("MIDDLEWARE_INTERNAL_SECRET", secret);
    const key = "a".repeat(64);
    const code = `Promise.all(Array.from({length:8},()=>fetch(process.env.TEST_ENDPOINT,{method:'POST',headers:{'content-type':'application/json','x-middleware-secret':process.env.TEST_SECRET},body:JSON.stringify({key:'${key}',windowMs:3600000})}).then(async r=>{if(!r.ok)throw Error('backend');return r.json()}))).then(x=>process.stdout.write(JSON.stringify(x.map(y=>y.count))))`;
    const run = () => promisify(execFile)(process.execPath, ["-e", code], { encoding: "utf8", env: { NODE_ENV: "test", TEST_ENDPOINT: endpoint, TEST_SECRET: secret, PATH: process.env.PATH! } });
    const outputs = await Promise.all([run(), run(), run()]);
    const counts = outputs.flatMap(o => JSON.parse(o.stdout)).sort((a,b)=>a-b);
    expect(counts).toEqual(Array.from({ length:24 }, (_,i)=>i+1));
    expect((await RateLimitCounter.findOne({ _id: new RegExp(`^${key}:`) }).lean() as any)?.count).toBe(24);
  });
  it("awaits the real HTTP store and blocks the sixth auth request", async () => {
    vi.stubEnv("MIDDLEWARE_INTERNAL_SECRET", secret);
    setRateLimitStore(new HttpRateLimitStore(endpoint, secret));
    const request = () => new Request("http://localhost/api/auth/register", { method:"POST", headers: { "x-real-ip":"192.0.2.34" } });
    for (let i=0;i<5;i++) expect(await checkRateLimit(request(), "/api/auth/register")).toBeNull();
    expect((await checkRateLimit(request(), "/api/auth/register"))?.status).toBe(429);
  });
  it("applies an account limit when IPs rotate without storing account PII", async () => {
    vi.stubEnv("MIDDLEWARE_INTERNAL_SECRET", secret); setRateLimitStore(new HttpRateLimitStore(endpoint, secret));
    const request = (i:number) => new Request("http://localhost/api/auth/password-reset/request", { method:"POST", headers: { "content-type":"application/json", "x-real-ip":`192.0.2.${100+i}` }, body:JSON.stringify({email:"synthetic@example.invalid"}) });
    for (let i=0;i<5;i++) expect(await checkRateLimit(request(i),"/api/auth/password-reset/request")).toBeNull();
    expect((await checkRateLimit(request(6),"/api/auth/password-reset/request"))?.status).toBe(429);
    expect(JSON.stringify(await RateLimitCounter.find({}).lean())).not.toMatch(/synthetic@example|192\.0\.2\./);
  });
  it("fails closed on asynchronous backend rejection", async () => {
    setRateLimitStore({ increment: async () => { throw new Error("secret backend URL must not leak"); } });
    const response = await checkRateLimit(new Request("http://localhost/api/auth/register"),"/api/auth/register");
    expect(response?.status).toBe(429); expect(await response!.text()).not.toContain("secret backend");
  });
  it("requires the internal secret before DB work", async () => {
    vi.stubEnv("MIDDLEWARE_INTERNAL_SECRET", undefined);
    expect((await POST(new NextRequest(endpoint,{method:"POST",headers:{"x-middleware-secret":"undefined"},body:"{}"}))).status).toBe(403);
  });
  it("resets counters at a new window independent of delayed TTL cleanup", async () => {
    let now=10000; const store=new MongoRateLimitStore(()=>now); const key="b".repeat(64);
    expect((await store.increment(key,1000)).count).toBe(1);
    expect((await store.increment(key,1000)).count).toBe(2);
    now=11000; expect((await store.increment(key,1000)).count).toBe(1);
    const indexes=await RateLimitCounter.collection.indexes(); expect(indexes.some(i=>i.expireAfterSeconds===0)).toBe(true);
  });
});
