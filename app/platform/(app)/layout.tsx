import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import {
  ADMIN_SESSION_COOKIE_NAME,
  getAdminActorFromCookieValue,
} from "@/lib/platform/auth/adminSession";
import { PlatformShell } from "@/components/platform/PlatformShell";

// Force fully dynamic, uncached rendering on every request. This gate reads
// a DB-tracked revocation flag on every load (Hard Rule: a revoked session
// must be rejected immediately, not until some cache TTL expires) — do not
// remove this even though cookies()/headers() usage should already opt the
// route out of caching, since this is a security-critical page where "should
// already" is not good enough.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * The authoritative admin-session gate for every /platform page. middleware.ts
 * also fast-path-redirects unauthenticated requests, but this layout is what
 * actually decides — it checks JWT validity, DB-tracked revocation, and
 * account status, matching the repo-wide convention that every protected
 * surface self-checks auth rather than trusting middleware alone.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  const actor = await getAdminActorFromCookieValue(token, {
    ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: headerStore.get("user-agent") ?? undefined,
  });

  if (!actor) {
    redirect("/platform/login");
  }

  // Identity is intentionally not passed down as a prop — see
  // components/platform/PlatformShell.tsx's own comment on why it fetches
  // its own identity client-side instead.
  return <PlatformShell>{children}</PlatformShell>;
}
