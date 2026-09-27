import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTenantSessionPolicyVersion,
  isTenantSessionPolicyCurrent,
  tenantSessionStaleReason,
} from "@/lib/auth/sessionPolicy";

describe("tenant auth session policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses an explicit security version first so ops can force re-login", () => {
    vi.stubEnv("SESSION_SECURITY_VERSION", "security-2026-09-26");
    vi.stubEnv("AUTH_SESSION_VERSION", "auth-older");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "deploy-sha");

    expect(getTenantSessionPolicyVersion()).toBe("security-2026-09-26");
    expect(isTenantSessionPolicyCurrent("security-2026-09-26")).toBe(true);
    expect(tenantSessionStaleReason("auth-older")).toBe("version_mismatch");
  });

  it("falls back to the Vercel deployment sha so redeploys invalidate old cookies", () => {
    vi.stubEnv("SESSION_SECURITY_VERSION", "");
    vi.stubEnv("AUTH_SESSION_VERSION", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "new-deploy-sha");

    expect(getTenantSessionPolicyVersion()).toBe("new-deploy-sha");
    expect(tenantSessionStaleReason("old-deploy-sha")).toBe("version_mismatch");
    expect(tenantSessionStaleReason("new-deploy-sha")).toBeNull();
  });

  it("treats old cookies without the marker as stale", () => {
    vi.stubEnv("AUTH_SESSION_VERSION", "v2");

    expect(tenantSessionStaleReason(undefined)).toBe("missing_version");
    expect(tenantSessionStaleReason("")).toBe("missing_version");
    expect(isTenantSessionPolicyCurrent(undefined)).toBe(false);
  });
});

import { authConfig } from "@/auth.config";

describe("NextAuth callback integration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stamps new logins with the current session policy version", async () => {
    vi.stubEnv("AUTH_SESSION_VERSION", "login-v1");
    const jwt = authConfig.callbacks!.jwt!;
    const token = await jwt({
      token: {},
      user: { id: "u1", role: "sales", tenantId: "t1", permissions: ["x"] } as any,
      account: null,
      profile: undefined,
      trigger: "signIn",
      session: undefined,
    } as any);

    expect(token.sessionPolicyVersion).toBe("login-v1");
    expect(token.sessionStale).toBe(false);
  });

  it("marks a token from an older deployment as stale for middleware", async () => {
    vi.stubEnv("AUTH_SESSION_VERSION", "new-v2");
    const jwt = authConfig.callbacks!.jwt!;
    const sessionCb = authConfig.callbacks!.session!;

    const token = await jwt({
      token: { id: "u1", role: "sales", tenantId: "t1", sessionPolicyVersion: "old-v1" },
      user: undefined,
      account: null,
      profile: undefined,
      trigger: undefined,
      session: undefined,
    } as any);
    const session = await sessionCb({
      session: { user: { name: "User", email: "u@example.com" }, expires: new Date(Date.now() + 3600_000).toISOString() },
      token,
      user: undefined,
      newSession: undefined,
      trigger: undefined,
    } as any);

    expect(token.sessionStale).toBe(true);
    expect((session.user as any).sessionStale).toBe(true);
  });
});
