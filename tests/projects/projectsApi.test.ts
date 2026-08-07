import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockConnectDB, mockFind, mockCreate } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockFind: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/models/Project", () => ({
  default: {
    find: (...args: any[]) => { mockFind(...args); return { sort: () => ({ lean: () => Promise.resolve([]) }) }; },
    create: mockCreate,
  },
}));

import { GET, POST } from "@/app/api/projects/route";

const TENANT = "tenant-a";
function makeReq(url: string, body?: any) {
  return { url, json: () => Promise.resolve(body) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", tenantId: TENANT, role: "project" } });
  mockConnectDB.mockResolvedValue(undefined);
  mockCreate.mockImplementation(async (doc: any) => ({ ...doc, _id: "p1" }));
});

describe("GET /api/projects", () => {
  it("401 without a tenant", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    const res = await GET(makeReq("http://x/api/projects"));
    expect(res.status).toBe(401);
  });

  it("scopes the query to the tenant", async () => {
    await GET(makeReq("http://x/api/projects"));
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT }));
  });

  it("applies a valid status filter and ignores an invalid one", async () => {
    await GET(makeReq("http://x/api/projects?status=active"));
    expect(mockFind.mock.calls[0][0]).toMatchObject({ tenantId: TENANT, status: "active" });

    mockFind.mockClear();
    await GET(makeReq("http://x/api/projects?status=bogus"));
    expect(mockFind.mock.calls[0][0]).not.toHaveProperty("status");
  });
});

describe("POST /api/projects", () => {
  it("400 when name is missing", async () => {
    const res = await POST(makeReq("http://x/api/projects", { description: "no name" }));
    expect(res.status).toBe(400);
  });

  it("creates a tenant-scoped project and returns 201", async () => {
    const res = await POST(makeReq("http://x/api/projects", { name: "Launch" }));
    expect(res.status).toBe(201);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.name).toBe("Launch");
    expect(arg.createdBy).toBe("u1");
  });
});
