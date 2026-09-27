const DEFAULT_SESSION_POLICY_VERSION = "static-v1";

/**
 * Version marker embedded into tenant NextAuth JWTs at login time.
 *
 * In production Vercel exposes the git SHA, so a redeploy naturally rotates
 * this value and old browser cookies are no longer trusted by middleware. A
 * manual AUTH_SESSION_VERSION/SESSION_SECURITY_VERSION override lets ops force
 * all tenant users to re-authenticate immediately after a credential/security
 * event even if the code commit did not change.
 */
export function getTenantSessionPolicyVersion(): string {
  return (
    process.env.SESSION_SECURITY_VERSION ||
    process.env.AUTH_SESSION_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    DEFAULT_SESSION_POLICY_VERSION
  ).trim();
}

export function isTenantSessionPolicyCurrent(version: unknown): boolean {
  return typeof version === "string" && version.length > 0 && version === getTenantSessionPolicyVersion();
}

export function tenantSessionStaleReason(version: unknown): "missing_version" | "version_mismatch" | null {
  if (typeof version !== "string" || version.length === 0) return "missing_version";
  return version === getTenantSessionPolicyVersion() ? null : "version_mismatch";
}
