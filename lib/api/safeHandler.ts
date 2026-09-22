import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/errors/friendlyError";

/**
 * Wraps a route handler so an unexpected throw returns a JSON 500 with a
 * plain-language message (and the real error in the server log) instead of
 * Next's HTML error page — which the client can't parse, so lists silently
 * failed with "Failed to load".
 */
export function safeHandler<A extends any[]>(
  handler: (...args: A) => Promise<Response>,
  fallback = "We couldn't complete this request. Please try again.",
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error: any) {
      if (error instanceof Response) return error;
      console.error("API error:", error);
      return NextResponse.json({ success: false, message: friendlyError(error, fallback), error: friendlyError(error, fallback) }, { status: 500 });
    }
  };
}
