/**
 * Tenant-fallback hardening (Part 1.1).
 *
 * The old `session.user.tenantId || "default-tenant"` pattern meant an
 * authenticated session missing a tenantId (e.g. a JWT/session regression)
 * would SILENTLY read/write the shared "default-tenant" bucket — a cross-tenant
 * data hazard. `requireTenantId` now hard-fails (401) instead. These tests prove
 * both the helper and a converted route fail loudly rather than touching
 * default-tenant data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireTenantId } from "@/lib/auth/requireTenantId";

describe("requireTenantId helper", () => {
  it("returns null (proceed) when the session has a real tenantId", () => {
    expect(requireTenantId({ user: { tenantId: "acme" } })).toBeNull();
  });

  it("returns a 401 when the session is authenticated but has NO tenantId", async () => {
    const res = requireTenantId({ user: { id: "u1" } }) as any;
    expect(res).not.toBeNull();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/tenant context missing/i);
  });

  it("returns a 401 when there is no session at all", () => {
    expect((requireTenantId(null) as any)?.status).toBe(401);
    expect((requireTenantId({}) as any)?.status).toBe(401);
  });

  it("rejects an empty-string tenantId (would otherwise query for tenantId:'')", () => {
    expect((requireTenantId({ user: { tenantId: "" } }) as any)?.status).toBe(401);
  });
});

// ── Route-level proof: a converted route hard-fails instead of reading
// default-tenant when the session has no tenantId. ────────────────────────────

const { mockAuth, mockFind } = vi.hoisted(() => ({ mockAuth: vi.fn(), mockFind: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/ChatHistory", () => ({ default: { find: mockFind } }));

import { GET } from "@/app/api/manufacturing/chat-history/route";

describe("converted route hard-fails on a tenantless session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 and NEVER queries ChatHistory (no default-tenant read) when tenantId is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } }); // authenticated but no tenantId
    const res = await GET({ url: "http://x/api/manufacturing/chat-history" } as any);
    expect(res.status).toBe(401);
    // Critically: the DB was never queried — no silent read against default-tenant.
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("proceeds and queries scoped to the real tenant when tenantId IS present", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", tenantId: "acme" } });
    mockFind.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) });
    const res = await GET({ url: "http://x/api/manufacturing/chat-history" } as any);
    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "acme" }));
    // And never against default-tenant.
    expect(mockFind).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: "default-tenant" }));
  });
});
