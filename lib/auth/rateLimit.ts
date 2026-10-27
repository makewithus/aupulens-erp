import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/middleware/rateLimit";

/** Node auth handlers use Mongo directly; no self-HTTP hop or middleware matcher dependency. */
export async function checkAuthRateLimit(request: Request, pathname: string) {
  if (process.env.RATE_LIMIT_STORE !== "mongo" && process.env.NODE_ENV !== "production") {
    return checkRateLimit(request, pathname);
  }
  try {
    const [{ default: connectDB }, { MongoRateLimitStore }] = await Promise.all([
      import("@/lib/db"), import("@/lib/middleware/mongoRateLimitStore"),
    ]);
    await connectDB();
    return await checkRateLimit(request, pathname, undefined, new MongoRateLimitStore());
  } catch {
    return NextResponse.json({ error: "Authentication service temporarily unavailable. Please try again.", code: "RATE_LIMIT_SERVICE_UNAVAILABLE" }, {
      status: 429, headers: { "Retry-After": "3" },
    });
  }
}
