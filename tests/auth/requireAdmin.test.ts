/**
 * Admin-role API gating (Part-A readiness).
 *
 * Org Structure, Business Twin, and Marketplace publish/install APIs live
 * outside the `/api/admin` middleware prefix, so they enforce admin access
 * themselves via requireAdmin. These tests prove a non-admin is refused (403) —
 * both the helper and, at route level, a real handler.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAdmin } from "@/lib/auth/requireAdmin";

describe("requireAdmin helper", () => {
  it("allows admin and master-admin", () => {
    expect(requireAdmin({ user: { role: "admin" } })).toBeNull();
    expect(requireAdmin({ user: { role: "master-admin" } })).toBeNull();
  });
  it("refuses every other role with 403", () => {
    for (const role of ["sales", "hr", "finance", "inventory", "manufacturing", "project", undefined]) {
      const res = requireAdmin({ user: { role } }) as any;
      expect(res?.status).toBe(403);
    }
  });
});

// ── Route-level: a non-admin session gets 403 from a new admin-only API. ──────
const { mockAuth, mockFind } = vi.hoisted(() => ({ mockAuth: vi.fn(), mockFind: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/admin/OrgUnit", () => ({ default: { find: mockFind }, ORG_LEVELS: ["Company", "Region", "Branch", "Office", "Warehouse", "Department", "Team", "Employee"] }));

import { GET as OrgGET } from "@/app/api/org/units/route";

describe("org units API — wrong-role attempt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for a sales user (not admin), and never queries OrgUnit", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", tenantId: "acme", role: "sales" } });
    const res = await OrgGET();
    expect(res.status).toBe(403);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("proceeds for an admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", tenantId: "acme", role: "admin" } });
    mockFind.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) });
    const res = await OrgGET();
    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "acme" }));
  });
});
