import { handlers } from "@/auth";
import { checkAuthRateLimit } from "@/lib/auth/rateLimit";
import type { NextRequest } from "next/server";

export const GET = handlers.GET;
export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/auth/callback/credentials") {
    const limited = await checkAuthRateLimit(request, "/api/auth/callback/credentials");
    if (limited) return limited;
  }
  return handlers.POST(request);
}
