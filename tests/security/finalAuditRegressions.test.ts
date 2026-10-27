import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { stripProtectedFields } from "@/lib/api/validateId";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn(), connect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ default: mocks.connect }));
vi.mock("@/models/auth/User", () => ({ default: { findOne: mocks.find, findOneAndUpdate: mocks.update } }));
vi.mock("@/lib/email/sendEmail", () => ({ getEmailService: vi.fn() }));
import { GET, PATCH } from "@/app/api/profile/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as reset } from "@/app/api/auth/password-reset/request/route";

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "audit-user", tenantId: "audit-tenant" } }); });
afterEach(() => vi.unstubAllEnvs());

describe("Final audit: profile identity and secret projection", () => {
  it.each(["GET", "PATCH"])("%s excludes every authentication token representation", async (method) => {
    const select = vi.fn().mockReturnValue({ lean: async () => ({ name: "Audit" }) });
    mocks.find.mockReturnValue({ select });
    mocks.update.mockReturnValue({ select: vi.fn().mockResolvedValue({ name: "Audit" }) });
    const response = method === "GET" ? await GET() : await PATCH(new Request("http://localhost/api/profile", { method: "PATCH", body: JSON.stringify({ name: "Audit" }) }));
    expect(response.status).toBe(200);
    const projection = method === "GET" ? select.mock.calls[0][0] : mocks.update.mock.results[0].value.select.mock.calls[0][0];
    for (const field of ["password", "tempToken", "tempTokenHash", "tempTokenExpiry", "passwordResetTokenHash", "passwordResetTokenExpiry"]) expect(projection.split(" ")).toContain(`-${field}`);
  });
  it.each(["GET", "PATCH"])("%s fails closed without authenticated user identity", async (method) => {
    mocks.auth.mockResolvedValue({ user: { email: "shared@example.invalid", tenantId: "audit-tenant" } });
    const response = method === "GET" ? await GET() : await PATCH(new Request("http://localhost/api/profile", { method: "PATCH", body: JSON.stringify({ name: "Audit" }) }));
    expect(response.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("Final audit: registration default gate", () => {
  it.each([undefined, "false"])("rejects new-tenant provisioning when flag is %s before database work", async (flag) => {
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", flag);
    const response = await register(new NextRequest("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Audit", email: "audit@example.invalid", phone: "1234567890", password: "test-password", subdomain: "audit-new" }) }));
    expect(response.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});

describe("Final audit: update path injection", () => {
  it("strips Mongo operators and dotted protected paths while retaining legitimate nested fields", () => {
    expect(stripProtectedFields({ name: "Valid", "tenantId.value": "foreign", "createdBy.id": "foreign", $set: { tenantId: "foreign" }, "address.city": "Pune" })).toEqual({ name: "Valid", "address.city": "Pune" });
  });
});

describe("Final audit: canonical reset configuration", () => {
  it.each([undefined, "javascript:alert(1)", "https://user:password@example.invalid", "https://example.invalid/attacker?next=bad"])("fails safely for invalid canonical URL %s before touching user tokens", async (base) => {
    vi.stubEnv("APP_BASE_URL", base);
    vi.stubEnv("NEXTAUTH_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", undefined);
    const response = await reset(new NextRequest("http://localhost/api/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email: "audit@example.invalid" }), headers: { host: "attacker.invalid", "x-forwarded-host": "attacker.invalid" } }));
    expect(response.status).toBe(500);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
