import { handlers } from "@/auth";
import { checkAuthRateLimit } from "@/lib/auth/rateLimit";
import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "__Host-next-auth.session-token",
];

function clearSessionCookies(request: NextRequest, callbackUrl: string) {
  const sameOrigin = request.nextUrl.origin;
  const response = NextResponse.json({ url: callbackUrl || new URL("/auth", sameOrigin).href });
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const configuredAuthUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "";
  const secure = request.nextUrl.protocol === "https:" || forwardedProto === "https" || configuredAuthUrl.startsWith("https://");
  const names = new Set(AUTH_COOKIE_NAMES);

  // Auth.js chunks large JWTs into numbered cookies. Clear any chunks that
  // are present as well as the standard unchunked cookie names. Keep the
  // CSRF cookie intact so the next sign-in can continue using its valid pair.
  for (const { name } of request.cookies.getAll()) {
    if (/^(?:__Secure-|__Host-)?(?:authjs|next-auth)\.session-token(?:\.\d+)?$/.test(name)) {
      names.add(name);
    }
  }

  for (const name of names) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
      secure,
    });
  }
  return response;
}

function sameOriginAuthRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const expectedOrigin = forwardedHost && forwardedProto
      ? `${forwardedProto.replace(/:$/, "")}://${forwardedHost}`
      : request.nextUrl.origin;
    return parsed.origin === expectedOrigin || parsed.origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

async function handleCredentialsCallback(request: NextRequest) {
  if (!sameOriginAuthRequest(request) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Cross-origin sign in is not allowed." }, { status: 403 });
  }

  const csrfPath = request.nextUrl.pathname.replace(/\/callback\/credentials$/, "/csrf");
  const csrfUrl = new URL(csrfPath, request.nextUrl.origin);
  const incomingCookies = (request.headers.get("cookie") || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie && !/^(?:(?:__Host-|__Secure-)?(?:authjs|next-auth))\.csrf-token=/.test(cookie));
  const csrfHeaders = new Headers(request.headers);
  csrfHeaders.delete("content-type");
  csrfHeaders.delete("content-length");
  csrfHeaders.set("cookie", incomingCookies.join("; "));

  // Ask the same Auth.js handler for a fresh token/cookie pair, then submit
  // that exact pair to credentials callback. This handles stale or duplicate
  // CSRF cookies left by prior sessions without disabling Auth.js validation.
  const csrfResponse = await handlers.GET(new NextRequest(csrfUrl, { method: "GET", headers: csrfHeaders }));
  if (!csrfResponse.ok) return csrfResponse;
  const csrfData = await csrfResponse.clone().json().catch(() => null);
  const csrfToken = typeof csrfData?.csrfToken === "string" ? csrfData.csrfToken : "";
  const csrfCookieHeader = csrfResponse.headers.get("set-cookie");
  const csrfCookiePair = csrfCookieHeader?.split(";", 1)[0];
  if (!csrfToken || !csrfCookiePair || !csrfCookiePair.includes("=")) {
    return NextResponse.json({ error: "Could not initialize sign-in security. Refresh and try again." }, { status: 503 });
  }

  const form = new URLSearchParams(await request.text());
  form.set("csrfToken", csrfToken);
  const callbackHeaders = new Headers(request.headers);
  callbackHeaders.set("content-type", "application/x-www-form-urlencoded");
  callbackHeaders.delete("content-length");
  callbackHeaders.set("cookie", [...incomingCookies, csrfCookiePair].join("; "));
  const callbackResponse = await handlers.POST(new NextRequest(request.url, {
    method: "POST",
    headers: callbackHeaders,
    body: form.toString(),
  }));

  // Persist the fresh CSRF cookie returned by /csrf while preserving callback
  // response cookies (including the newly issued session token).
  const headers = new Headers(callbackResponse.headers);
  headers.append("set-cookie", csrfCookieHeader);
  return new Response(callbackResponse.body, {
    status: callbackResponse.status,
    statusText: callbackResponse.statusText,
    headers,
  });
}

async function handleSignOut(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== request.nextUrl.origin) || fetchSite === "cross-site") {
    return NextResponse.json({ error: "Cross-origin sign out is not allowed." }, { status: 403 });
  }

  // The stock Auth.js signout action can fail closed when a CSRF cookie was
  // rotated or lost between tabs. Logout only clears this browser's own auth
  // cookies, so use a same-origin guarded endpoint and return the response
  // shape expected by next-auth/react's signOut() client.
  const form = new URLSearchParams(await request.text());
  const callback = form.get("callbackUrl") || "/auth";
  let url = new URL("/auth", request.nextUrl.origin);
  try {
    const candidate = new URL(callback, request.nextUrl.origin);
    if (candidate.origin === request.nextUrl.origin) url = candidate;
  } catch { /* invalid callback uses the safe sign-in URL */ }

  return clearSessionCookies(request, url.href);
}

export const GET = handlers.GET;
export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/auth/signout") {
    return handleSignOut(request);
  }
  if (request.nextUrl.pathname === "/api/auth/callback/credentials") {
    const limited = await checkAuthRateLimit(request, "/api/auth/callback/credentials");
    if (limited) return limited;
    return handleCredentialsCallback(request);
  }
  return handlers.POST(request);
}
