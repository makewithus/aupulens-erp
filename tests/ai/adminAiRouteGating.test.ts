/**
 * Regression test: admin AI assistant route — tenant AI gating.
 *
 * This route's intent-classification call (analyzeQueryIntent) intentionally
 * stays on the bare callClaude() per lib/ai/tenantAi.ts's own documented
 * convention (internal classification calls don't count against the user's
 * quota) — only the main user-visible response generator
 * (generateResponseWithClaude) needs to go through callClaudeForTenant.
 * See tests/ai/salesAiRouteGating.test.ts for the general rationale.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAuth,
  mockConnectDB,
  mockCallClaude,
  mockResolveTenantAiSettings,
  mockCallClaudeForTenant,
  mockChatHistoryFindOne,
  mockChatHistoryFindOneAndUpdate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockCallClaude: vi.fn(),
  mockResolveTenantAiSettings: vi.fn(),
  mockCallClaudeForTenant: vi.fn(),
  mockChatHistoryFindOne: vi.fn(),
  mockChatHistoryFindOneAndUpdate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));

vi.mock("@/lib/ai/adminDataFetcher", () => ({
  fetchAdminFinanceData: vi.fn().mockResolvedValue({ summary: { totalRevenue: 0 } }),
  fetchAdminSalesData: vi.fn().mockResolvedValue({ summary: { totalOrders: 0 } }),
  fetchAdminInventoryData: vi.fn().mockResolvedValue({ summary: { totalItems: 0 } }),
  fetchAdminManufacturingData: vi.fn().mockResolvedValue({ summary: { totalShipments: 0 } }),
  fetchAdminUsersData: vi.fn().mockResolvedValue({ summary: { totalUsers: 0 } }),
  fetchAdminGeneralData: vi.fn().mockResolvedValue({ summary: { totalUsers: 0, totalOrders: 0, totalInventoryItems: 0 } }),
}));

// Intent classification stays on the bare client (internal, not gated) —
// force it into the deterministic simpleIntentAnalysis fallback so this
// suite doesn't depend on a real classifier response.
vi.mock("@/lib/ai/claude", () => ({ callClaude: mockCallClaude }));

vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: mockResolveTenantAiSettings,
  callClaudeForTenant: mockCallClaudeForTenant,
}));

vi.mock("@/models/ChatHistory", () => ({
  default: {
    findOne: mockChatHistoryFindOne,
    findOneAndUpdate: mockChatHistoryFindOneAndUpdate,
  },
}));

import { POST } from "@/app/api/admin/ai-assistant/route";

const TENANT_A = "tenant-alpha";

function makeSession(tenantId: string | undefined) {
  return { user: { id: "user-1", role: "admin", tenantId } };
}

function makeRequest(body: Record<string, any>) {
  return { json: () => Promise.resolve(body) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeSession(TENANT_A));
  mockConnectDB.mockResolvedValue(undefined);
  // Intent classifier throws -> route falls back to simpleIntentAnalysis, no gating concern here.
  mockCallClaude.mockRejectedValue(new Error("not used in this suite"));
  mockResolveTenantAiSettings.mockResolvedValue({ tier: "starter", aiSettings: {} });
  mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: "Admin overview response." });
  mockChatHistoryFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  mockChatHistoryFindOneAndUpdate.mockResolvedValue({});
});

describe("admin/ai-assistant — tenant AI gating", () => {
  it("returns 200 with a real response when the tenant is not gated", async () => {
    const res = await POST(makeRequest({ message: "give me an overview" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe("Admin overview response.");
  });

  it("returns 403 with AI_DISABLED and skips ChatHistory writes when the kill-switch is on", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_DISABLED",
      error: "AI features are disabled for this workspace. Contact your workspace admin to re-enable them.",
    });
    const res = await POST(makeRequest({ message: "give me an overview" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_DISABLED");
    expect(mockChatHistoryFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 with AI_LIMIT_REACHED when the monthly cap is hit", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_LIMIT_REACHED",
      error: "Monthly AI call limit reached (50 / 50 calls used this month).",
      currentTier: "starter",
      requiredAction: "upgrade",
    });
    const res = await POST(makeRequest({ message: "give me an overview" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_LIMIT_REACHED");
    expect(mockChatHistoryFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("resolves tenant AI settings using the authenticated tenant", async () => {
    await POST(makeRequest({ message: "give me an overview" }));
    expect(mockResolveTenantAiSettings).toHaveBeenCalledWith(TENANT_A);
  });

  it("still returns 401 when tenantId is missing", async () => {
    mockAuth.mockResolvedValue(makeSession(undefined));
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(401);
  });
});
