import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockConnectDB, mockUserFind, mockOrgFind } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockUserFind: vi.fn(),
  mockOrgFind: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/models/auth/User", () => ({
  default: { find: (...args: any[]) => { mockUserFind(...args); return { select: () => ({ lean: () => Promise.resolve([]) }) }; } },
}));
vi.mock("@/models/admin/Organization", () => ({
  default: { find: (...args: any[]) => { mockOrgFind(...args); return { select: () => ({ lean: () => Promise.resolve([]) }) }; } },
}));
vi.mock("@/lib/config", () => ({ buildTenantUrl: (t: string) => `https://${t}.aupulens.online` }));

import { GET } from "@/app/api/auth/my-workspaces/route";

beforeEach(() => {
  vi.clearAllMocks();
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
});
