/**
 * Regression test: sales AI assistant route — tenant AI gating.
 *
 * Phase 0 follow-up: this route used to call bare callClaude()/
 * callClaudeWithHistory(), skipping the workspace kill-switch and monthly
 * call cap entirely. Verifies the route now goes through
 * lib/ai/tenantAi.ts's callClaudeForTenant() and is actually blocked when
 * gated — not just "wired up in theory."
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAuth,
  mockConnectDB,
  mockSaleOrderFind,
  mockSaleOrderAggregate,
  mockResolveTenantAiSettings,
  mockCallClaudeForTenant,
  mockChatHistoryFindOne,
  mockChatHistoryFindOneAndUpdate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockSaleOrderFind: vi.fn(),
  mockSaleOrderAggregate: vi.fn(),
  mockResolveTenantAiSettings: vi.fn(),
  mockCallClaudeForTenant: vi.fn(),
  mockChatHistoryFindOne: vi.fn(),
  mockChatHistoryFindOneAndUpdate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));

function buildChain(result: any = []) {
  const chain: any = {
    sort: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(result),
  };
  return chain;
}

vi.mock("@/models/SaleOrder", () => ({
  default: {
    find: (...args: any[]) => { mockSaleOrderFind(...args); return buildChain([]); },
    aggregate: (...args: any[]) => { mockSaleOrderAggregate(...args); return { exec: () => Promise.resolve([]) }; },
  },
}));
vi.mock("@/models/SalesQuotation", () => ({ default: {} }));
vi.mock("@/models/DeliveryChallan", () => ({ default: {} }));

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

import { POST } from "@/app/api/sales/ai-assistant/route";

const TENANT_A = "tenant-alpha";

function makeSession(tenantId: string | undefined) {
  return { user: { id: "user-1", role: "sales", tenantId } };
}

function makeRequest(body: Record<string, any>) {
  return { json: () => Promise.resolve(body) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeSession(TENANT_A));
  mockConnectDB.mockResolvedValue(undefined);
  mockResolveTenantAiSettings.mockResolvedValue({ tier: "starter", aiSettings: {} });
  mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: "Sales overview response." });
  mockChatHistoryFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  mockChatHistoryFindOneAndUpdate.mockResolvedValue({});
});

describe("sales/ai-assistant — tenant AI gating", () => {
  it("returns 200 with a real response when the tenant is not gated", async () => {
    const res = await POST(makeRequest({ message: "how are sales?" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe("Sales overview response.");
  });

  it("returns 403 with AI_DISABLED and skips ChatHistory writes when the kill-switch is on", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_DISABLED",
      error: "AI features are disabled for this workspace. Contact your workspace admin to re-enable them.",
    });
    const res = await POST(makeRequest({ message: "how are sales?" }));
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
    const res = await POST(makeRequest({ message: "how are sales?" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_LIMIT_REACHED");
    expect(mockChatHistoryFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("resolves tenant AI settings using the authenticated tenant", async () => {
    await POST(makeRequest({ message: "how are sales?" }));
    expect(mockResolveTenantAiSettings).toHaveBeenCalledWith(TENANT_A);
  });

  it("still returns 401 when tenantId is missing (auth guard unaffected by gating change)", async () => {
    mockAuth.mockResolvedValue(makeSession(undefined));
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(401);
  });
});
