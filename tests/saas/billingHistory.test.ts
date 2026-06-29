import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockAuth,
  mockConnectDB,
  mockRequireOrgAdmin,
  mockEventFind,
  mockEventFindSort,
  mockEventFindSortLean,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockRequireOrgAdmin: vi.fn(),
  mockEventFind: vi.fn(),
  mockEventFindSort: vi.fn(),
  mockEventFindSortLean: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/lib/org/rbac", () => ({ requireOrgAdmin: mockRequireOrgAdmin }));

vi.mock("@/models/SubscriptionEvent", () => {
  function SubscriptionEvent() {}
  // Chain: .find({ tenantId }).sort({ occurredAt: -1 }).lean()
  SubscriptionEvent.find = (...args: any[]) => {
    mockEventFind(...args);
    return { sort: mockEventFindSort };
  };
  mockEventFindSort.mockReturnValue({ lean: mockEventFindSortLean });
  return { default: SubscriptionEvent };
});

vi.mock("@/lib/constants/statuses", () => ({
  ENTITY_STATUS: { ACTIVE: "active" },
  SUBSCRIPTION_EVENT_TYPE: {
    CREATED: "created", UPGRADED: "upgraded", DOWNGRADED: "downgraded",
    RENEWED: "renewed", PAYMENT_SUCCEEDED: "payment_succeeded",
    PAYMENT_FAILED: "payment_failed", CANCELED: "canceled",
  },
  SUBSCRIPTION_EVENT_TYPE_VALUES: [
    "created", "upgraded", "downgraded", "renewed",
    "payment_succeeded", "payment_failed", "canceled",
  ],
  ORGANIZATION_TIER_VALUES: ["starter", "professional", "enterprise"],
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest() {
  return new NextRequest("http://acme.aupulens.online/api/billing/history", {
    method: "GET",
  });
}

function adminSession(overrides: object = {}) {
  return {
    user: { id: "admin-id", tenantId: "acme", role: "admin", email: "admin@acme.com", ...overrides },
  };
}

const fakeEvents = [
  { _id: "ev-2", tenantId: "acme", type: "upgraded", tier: "professional", occurredAt: new Date("2026-06-15") },
  { _id: "ev-1", tenantId: "acme", type: "created",  tier: "starter",      occurredAt: new Date("2026-06-01") },
];

// ── Route loader ──────────────────────────────────────────────────────────────
let GET: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.resetAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockRequireOrgAdmin.mockReturnValue(undefined); // allow by default
  // Re-wire sort chain after resetAllMocks
  mockEventFindSort.mockReturnValue({ lean: mockEventFindSortLean });
  mockEventFindSortLean.mockResolvedValue(fakeEvents);
  const mod = await import("@/app/api/billing/history/route");
  GET = mod.GET;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/billing/history — auth guards", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no tenantId", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not admin (e.g. finance)", async () => {
    mockAuth.mockResolvedValue(adminSession({ role: "finance" }));
    mockRequireOrgAdmin.mockImplementation(() => { throw new Error("Forbidden"); });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/admin/i);
  });
});

describe("GET /api/billing/history — successful response", () => {
  beforeEach(() => mockAuth.mockResolvedValue(adminSession()));

  it("returns 200 with success:true and data array", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("returns all events from the mock", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it("queries are sorted by occurredAt descending (newest first)", async () => {
    await GET(makeRequest());
    expect(mockEventFindSort).toHaveBeenCalledWith({ occurredAt: -1 });
  });

  it("uses .lean() for performance", async () => {
    await GET(makeRequest());
    expect(mockEventFindSortLean).toHaveBeenCalled();
  });
});

describe("GET /api/billing/history — tenant isolation", () => {
  beforeEach(() => mockAuth.mockResolvedValue(adminSession()));

  it("scopes query to session tenantId", async () => {
    await GET(makeRequest());
    expect(mockEventFind).toHaveBeenCalledWith({ tenantId: "acme" });
  });

  it("does NOT query another tenant's events", async () => {
    await GET(makeRequest());
    const callArg = mockEventFind.mock.calls[0][0];
    expect(callArg.tenantId).toBe("acme");
    expect(callArg.tenantId).not.toBe("otherorg");
  });

  it("a different tenant's admin sees only their own events", async () => {
    mockAuth.mockResolvedValue(adminSession({ tenantId: "otherorg" }));
    mockEventFindSortLean.mockResolvedValue([]); // otherorg has no events
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(mockEventFind).toHaveBeenCalledWith({ tenantId: "otherorg" });
  });
});

describe("GET /api/billing/history — append-only enforcement", () => {
  it("route only exports GET (no POST/PUT/DELETE)", async () => {
    const mod = await import("@/app/api/billing/history/route");
    expect(typeof mod.GET).toBe("function");
    expect((mod as any).POST).toBeUndefined();
    expect((mod as any).PUT).toBeUndefined();
    expect((mod as any).DELETE).toBeUndefined();
  });
});
