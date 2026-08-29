/**
 * Tests for AiMemory model + /api/ai/memory route behaviour:
 * - Compound unique index: tenantId + scope + key
 * - Tenant isolation: queries always include tenantId
 * - GET: by scope only (list), by scope+key (single)
 * - POST: upsert with $set, validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks ──────────────────────────────────────────────────────────────

const { mockFindOne, mockFind, mockFindOneAndUpdate, mockAuth, mockConnectDB } =
  vi.hoisted(() => ({
    mockFindOne: vi.fn(),
    mockFind: vi.fn(),
    mockFindOneAndUpdate: vi.fn(),
    mockAuth: vi.fn(),
    mockConnectDB: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("@/models/ai/AiMemory", () => ({
  default: {
    findOne: mockFindOne,
    find: mockFind,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));

import { GET, POST } from "@/app/api/ai/memory/route";
import AiMemory from "@/models/ai/AiMemory";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";

function makeSession(tenantId: string) {
  return { user: { tenantId, id: "user-123" } };
}

function makeRequest(method: "GET" | "POST", url: string, body?: object): Request {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new Request(url, init) as any;
}

function leanChain(result: any) {
  return { lean: () => Promise.resolve(result) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeSession(TENANT_A));
  mockFind.mockReturnValue(leanChain([]));
  mockFindOne.mockReturnValue(leanChain(null));
  mockFindOneAndUpdate.mockReturnValue(leanChain(null));
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("AiMemory API — auth guards", () => {
  it("GET returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET", "http://localhost/api/ai/memory?scope=global") as any);
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST", "http://localhost/api/ai/memory", { scope: "global", key: "k", value: "v" }) as any);
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no tenantId", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u" } });
    const res = await GET(makeRequest("GET", "http://localhost/api/ai/memory?scope=global") as any);
    expect(res.status).toBe(401);
  });
});

// ─── GET validation ───────────────────────────────────────────────────────────

describe("AiMemory API — GET validation", () => {
  it("returns 400 when scope is missing", async () => {
    const res = await GET(makeRequest("GET", "http://localhost/api/ai/memory") as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when scope is invalid", async () => {
    const res = await GET(makeRequest("GET", "http://localhost/api/ai/memory?scope=unknown") as any);
    expect(res.status).toBe(400);
  });
});

// ─── GET behaviour ────────────────────────────────────────────────────────────

describe("AiMemory API — GET behaviour", () => {
  it("lists all memories for a scope (no key param)", async () => {
    const stored = [{ tenantId: TENANT_A, scope: "finance", key: "k1", value: "v1" }];
    mockFind.mockReturnValueOnce(leanChain(stored));

    const res = await GET(makeRequest("GET", "http://localhost/api/ai/memory?scope=finance") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it("list query always includes tenantId", async () => {
    await GET(makeRequest("GET", "http://localhost/api/ai/memory?scope=sales") as any);
    const findArg = mockFind.mock.calls[0][0];
    expect(findArg).toHaveProperty("tenantId", TENANT_A);
    expect(findArg).toHaveProperty("scope", "sales");
  });

  it("fetches single memory when key is provided", async () => {
    const stored = { tenantId: TENANT_A, scope: "global", key: "preferredCurrency", value: "INR" };
    mockFindOne.mockReturnValueOnce(leanChain(stored));

    const res = await GET(makeRequest("GET", "http://localhost/api/ai/memory?scope=global&key=preferredCurrency") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.value).toBe("INR");
  });

  it("single-fetch query always includes tenantId", async () => {
    await GET(makeRequest("GET", "http://localhost/api/ai/memory?scope=hr&key=myKey") as any);
    const findOneArg = mockFindOne.mock.calls[0][0];
    expect(findOneArg).toHaveProperty("tenantId", TENANT_A);
  });

  it("returns null data (not 404) when key not found", async () => {
    mockFindOne.mockReturnValueOnce(leanChain(null));
    const res = await GET(makeRequest("GET", "http://localhost/api/ai/memory?scope=global&key=missing") as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
  });
});

// ─── POST validation ──────────────────────────────────────────────────────────

describe("AiMemory API — POST validation", () => {
  it("returns 400 for invalid scope", async () => {
    const res = await POST(makeRequest("POST", "http://localhost/api/ai/memory", { scope: "bogus", key: "k", value: "v" }) as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when key is missing", async () => {
    const res = await POST(makeRequest("POST", "http://localhost/api/ai/memory", { scope: "global", value: "v" }) as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when value is missing", async () => {
    const res = await POST(makeRequest("POST", "http://localhost/api/ai/memory", { scope: "global", key: "k" }) as any);
    expect(res.status).toBe(400);
  });
});

// ─── POST behaviour ───────────────────────────────────────────────────────────

describe("AiMemory API — POST upsert", () => {
  it("upserts with tenantId in filter", async () => {
    const saved = { tenantId: TENANT_A, scope: "global", key: "theme", value: "dark" };
    mockFindOneAndUpdate.mockReturnValueOnce(leanChain(saved));

    const res = await POST(makeRequest("POST", "http://localhost/api/ai/memory", { scope: "global", key: "theme", value: "dark" }) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const filter = mockFindOneAndUpdate.mock.calls[0][0];
    expect(filter).toHaveProperty("tenantId", TENANT_A);
    expect(filter).toHaveProperty("scope", "global");
    expect(filter).toHaveProperty("key", "theme");
  });

  it("uses $set so value is overwritten on re-upsert", async () => {
    mockFindOneAndUpdate.mockReturnValueOnce(leanChain({}));

    await POST(makeRequest("POST", "http://localhost/api/ai/memory", { scope: "global", key: "k", value: "updated" }) as any);

    const update = mockFindOneAndUpdate.mock.calls[0][1];
    expect(update).toHaveProperty("$set");
    expect(update.$set.value).toBe("updated");
  });

  it("tenant A upsert does not touch tenant B (filter is scoped)", async () => {
    mockFindOneAndUpdate.mockReturnValueOnce(leanChain({}));
    mockAuth.mockResolvedValueOnce(makeSession(TENANT_A));

    await POST(makeRequest("POST", "http://localhost/api/ai/memory", { scope: "global", key: "k", value: "v" }) as any);

    const filter = mockFindOneAndUpdate.mock.calls[0][0];
    expect(filter.tenantId).toBe(TENANT_A);
    expect(filter.tenantId).not.toBe(TENANT_B);
  });

  it("trims whitespace from key before saving", async () => {
    mockFindOneAndUpdate.mockReturnValueOnce(leanChain({}));

    await POST(makeRequest("POST", "http://localhost/api/ai/memory", { scope: "global", key: "  myKey  ", value: "v" }) as any);

    const filter = mockFindOneAndUpdate.mock.calls[0][0];
    expect(filter.key).toBe("myKey");
  });
});
