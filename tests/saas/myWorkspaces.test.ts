import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockConnectDB, mockUserFind, mockOrgFind, memberships, organizations } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockUserFind: vi.fn(),
  mockOrgFind: vi.fn(),
  memberships: [] as any[],
  organizations: [] as any[],
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/models/auth/User", () => ({
  default: { find: (...args: any[]) => { mockUserFind(...args); return { select: () => ({ lean: () => Promise.resolve(memberships) }) }; } },
}));
vi.mock("@/models/admin/Organization", () => ({
  default: { find: (...args: any[]) => { mockOrgFind(...args); return { select: () => ({ lean: () => Promise.resolve(organizations) }) }; } },
}));
vi.mock("@/lib/config", () => ({
  APP_BASE_URL: "https://aupulens.online",
  buildTenantUrl: (t: string) => `https://${t}.aupulens.online`,
}));

import { GET } from "@/app/api/auth/my-workspaces/route";

beforeEach(() => {
  vi.clearAllMocks();
  memberships.splice(0);
  organizations.splice(0);
  mockConnectDB.mockResolvedValue(undefined);
});

describe("GET /api/auth/my-workspaces", () => {
  it("returns 401 with no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with an empty list when the user isn't a member anywhere (edge case)", async () => {
    mockAuth.mockResolvedValue({ user: { email: "a@b.com", tenantId: "tenant-a" } });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("queries User.find scoped by email, not tenantId (cross-tenant lookup is the whole point)", async () => {
    mockAuth.mockResolvedValue({ user: { email: "a@b.com", tenantId: "tenant-a" } });
    await GET();
    expect(mockUserFind).toHaveBeenCalledWith({ email: "a@b.com" });
  });

  it("routes master-admin membership to the base host instead of a dead tenant subdomain", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@aupulens.com", tenantId: "tenant-a" } });
    memberships.push(
      { tenantId: "tenant-a", role: "admin" },
      { tenantId: "master", role: "master-admin" },
    );
    organizations.push({ subdomain: "tenant-a", name: "Aupulens Technologies" });

    const res = await GET();
    const body = await res.json();
    const master = body.data.find((workspace: any) => workspace.role === "master-admin");

    expect(master).toMatchObject({ tenantId: "master", url: "https://aupulens.online", current: false });
    expect(master.url).not.toContain("master.aupulens.online");
  });
});
