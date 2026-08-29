/**
 * Regression test: inventory AI assistant route — tenant AI gating.
 * See tests/ai/salesAiRouteGating.test.ts for the rationale (Phase 0 follow-up).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAuth,
  mockConnectDB,
  mockInventoryItemFind,
  mockResolveTenantAiSettings,
  mockCallClaudeForTenant,
  mockChatHistoryFindOne,
  mockChatHistoryFindOneAndUpdate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockInventoryItemFind: vi.fn(),
  mockResolveTenantAiSettings: vi.fn(),
  mockCallClaudeForTenant: vi.fn(),
  mockChatHistoryFindOne: vi.fn(),
  mockChatHistoryFindOneAndUpdate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));

vi.mock("@/models/inventory/InventoryItem", () => ({
  default: {
    find: (...args: any[]) => { mockInventoryItemFind(...args); return { lean: () => Promise.resolve([]) }; },
  },
}));
vi.mock("@/models/inventory/Batch", () => ({ default: {} }));

vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: mockResolveTenantAiSettings,
  callClaudeForTenant: mockCallClaudeForTenant,
}));

vi.mock("@/models/ai/ChatHistory", () => ({
  default: {
    findOne: mockChatHistoryFindOne,
    findOneAndUpdate: mockChatHistoryFindOneAndUpdate,
  },
}));

import { POST } from "@/app/api/inventory/ai-assistant/route";

const TENANT_A = "tenant-alpha";

function makeSession(tenantId: string | undefined) {
  return { user: { id: "user-1", role: "inventory", tenantId } };
}

function makeRequest(body: Record<string, any>) {
  return { json: () => Promise.resolve(body) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeSession(TENANT_A));
  mockConnectDB.mockResolvedValue(undefined);
  mockResolveTenantAiSettings.mockResolvedValue({ tier: "starter", aiSettings: {} });
  mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: "Inventory overview response." });
  mockChatHistoryFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  mockChatHistoryFindOneAndUpdate.mockResolvedValue({});
});

describe("inventory/ai-assistant — tenant AI gating", () => {
  it("returns 200 with a real response when the tenant is not gated", async () => {
    const res = await POST(makeRequest({ message: "any low stock?" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe("Inventory overview response.");
  });

  it("returns 403 with AI_DISABLED and skips ChatHistory writes when the kill-switch is on", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_DISABLED",
      error: "AI features are disabled for this workspace. Contact your workspace admin to re-enable them.",
    });
    const res = await POST(makeRequest({ message: "any low stock?" }));
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
    const res = await POST(makeRequest({ message: "any low stock?" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_LIMIT_REACHED");
    expect(mockChatHistoryFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("resolves tenant AI settings using the authenticated tenant", async () => {
    await POST(makeRequest({ message: "any low stock?" }));
    expect(mockResolveTenantAiSettings).toHaveBeenCalledWith(TENANT_A);
  });

  it("still returns 401 when tenantId is missing", async () => {
    mockAuth.mockResolvedValue(makeSession(undefined));
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(401);
  });
});
