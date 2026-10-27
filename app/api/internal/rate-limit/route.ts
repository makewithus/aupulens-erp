import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import connectDB from "@/lib/db";
import { MongoRateLimitStore, RateLimitCounter } from "@/lib/middleware/mongoRateLimitStore";
const store = new MongoRateLimitStore();
export async function POST(req: NextRequest) {
  const secret = process.env.MIDDLEWARE_INTERNAL_SECRET;
  const supplied = req.headers.get("x-middleware-secret") || "";
  if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { key, windowMs } = await req.json();
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key) || !Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 3600000) {
      return NextResponse.json({ error: "Invalid limiter input" }, { status: 400 });
    }
    await connectDB();
    await RateLimitCounter.init();
    return NextResponse.json(await store.increment(key, windowMs));
  } catch {
    // Do not log incoming credentials, account identifiers or connection errors containing URIs.
    return NextResponse.json({ error: "Rate limit service unavailable" }, { status: 503 });
  }
}
