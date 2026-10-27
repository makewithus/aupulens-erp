import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ config: null as any, findUser: vi.fn(), consume: vi.fn(), compare: vi.fn() }));
vi.mock("next-auth", () => ({ default: (config: any) => { m.config = config; return {}; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (config: any) => config }));
vi.mock("@/auth.config", () => ({ authConfig: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/auth/User", () => ({ default: { findOne: m.findUser } }));
vi.mock("@/models/admin/Organization", () => ({ default: { findOne: async () => null } }));
vi.mock("@/lib/auth/consumeOnboardingToken", () => ({ consumeOnboardingToken: m.consume }));
vi.mock("bcryptjs", () => ({ default: { compare: m.compare } }));
vi.mock("@/lib/auth/oauthSignIn", () => ({ resolveOAuthSignIn: vi.fn() }));
import "@/auth";
const token = `autologin_${"a".repeat(48)}`;
beforeEach(() => {
  vi.clearAllMocks();
  m.findUser.mockResolvedValue({ _id: "507f1f77bcf86cd799439011", tenantId: "purpose-a", role: "admin", status: "active", password: "bcrypt-fixture" });
  m.compare.mockResolvedValue(false);
  m.consume.mockResolvedValue(false);
});
const authorize = (credentials: any) => m.config.providers.find((provider: any) => provider.authorize).authorize(credentials);
describe("Final audit: actual credentials provider purpose separation", () => {
  it("does not accept an onboarding credential as an ordinary password", async () => {
    expect(await authorize({ email: "audit@example.invalid", tenantId: "purpose-a", password: token })).toBeNull();
    expect(m.compare).toHaveBeenCalledWith(token, "bcrypt-fixture");
    expect(m.consume).not.toHaveBeenCalled();
  });
  it("allows repeated ordinary credential login after an onboarding token expires", async () => {
    m.consume.mockResolvedValue(false);
    expect(await authorize({ email: "audit@example.invalid", tenantId: "purpose-a", autologinToken: token })).toBeNull();
    m.compare.mockResolvedValue(true);
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await authorize({ email: "  AUDIT@example.invalid  ", tenantId: "purpose-a", password: "correct-password" }))
        .toMatchObject({ tenantId: "purpose-a" });
    }
    expect(m.findUser).toHaveBeenLastCalledWith({ email: "audit@example.invalid", tenantId: "purpose-a" });
    expect(m.compare).toHaveBeenCalledWith("correct-password", "bcrypt-fixture");
  });
  it("uses the dedicated atomic verifier for onboarding", async () => {
    m.consume.mockResolvedValue(true);
    expect(await authorize({ email: "audit@example.invalid", tenantId: "purpose-a", password: "", autologinToken: token })).toMatchObject({ tenantId: "purpose-a" });
    expect(m.consume).toHaveBeenCalledWith("507f1f77bcf86cd799439011", "purpose-a", token);
    expect(m.compare).not.toHaveBeenCalled();
  });
  it("rejects an invalid onboarding credential without falling back to password verification", async () => {
    m.compare.mockResolvedValue(true);
    expect(await authorize({ email: "audit@example.invalid", tenantId: "purpose-a", password: "valid-password", autologinToken: "invalid" })).toBeNull();
    expect(m.compare).not.toHaveBeenCalled();
  });
});
