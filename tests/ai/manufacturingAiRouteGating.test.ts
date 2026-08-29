/**
 * Regression test: manufacturing AI assistant route — tenant AI gating.
 *
 * This route's only real AI call is inside analyzeIntentAndExtractData
 * (task-intent classification) — unlike the other 5 modules there is no
 * separate "main response" call (the plain-conversation path is 100%
 * deterministic, zero AI). Per the CTO's explicit instruction to verify
 * blocking on *all* 6 routes, this classification call was routed through
 * callClaudeForTenant too (a deliberate scope decision beyond
 * lib/ai/tenantAi.ts's "internal classification is exempt" convention —
 * otherwise this route could never be shown as blocked, since it has no
 * other AI call site to gate). See tests/ai/salesAiRouteGating.test.ts for
 * the general rationale.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAuth,
  mockConnectDB,
  mockResolveTenantAiSettings,
  mockCallClaudeForTenant,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockResolveTenantAiSettings: vi.fn(),
  mockCallClaudeForTenant: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/models/manufacturing/Shipment", () => ({ default: { find: () => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }) } }));
vi.mock("@/models/manufacturing/AirFreight", () => ({ default: {} }));
vi.mock("@/models/manufacturing/HSCode", () => ({ default: {} }));

vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: mockResolveTenantAiSettings,
  callClaudeForTenant: mockCallClaudeForTenant,
}));

import { POST } from "@/app/api/manufacturing/ai-assistant/route";

const TENANT_A = "tenant-alpha";

function makeSession(tenantId: string | undefined) {
  return { user: { id: "user-1", role: "manufacturing", tenantId } };
}

function makeRequest(body: Record<string, any>) {
  return { json: () => Promise.resolve(body) } as any;
}

function makeIntentJsonResponse() {
  return JSON.stringify({
    intent: "create_hs_code",
    entity: "hs_code",
    action: "create",
    confidence: 0.9,
    data: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeSession(TENANT_A));
  mockConnectDB.mockResolvedValue(undefined);
  mockResolveTenantAiSettings.mockResolvedValue({ tier: "starter", aiSettings: {} });
  mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: makeIntentJsonResponse() });
});

describe("manufacturing/ai-assistant — tenant AI gating", () => {
  it("returns 200 (task flow continues) when the tenant is not gated", async () => {
    const res = await POST(makeRequest({ message: "create a new hs code for widgets" }));
    expect(res.status).toBe(200);
  });

  it("returns 403 with AI_DISABLED when the kill-switch is on (new-task path)", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_DISABLED",
      error: "AI features are disabled for this workspace. Contact your workspace admin to re-enable them.",
    });
    const res = await POST(makeRequest({ message: "create a new hs code for widgets" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_DISABLED");
  });

  it("returns 403 with AI_LIMIT_REACHED when the monthly cap is hit (new-task path)", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_LIMIT_REACHED",
      error: "Monthly AI call limit reached (50 / 50 calls used this month).",
      currentTier: "starter",
      requiredAction: "upgrade",
    });
    const res = await POST(makeRequest({ message: "create a new hs code for widgets" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_LIMIT_REACHED");
  });

  it("returns 403 when gated on the continuation-of-task path too", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_DISABLED",
      error: "AI features are disabled for this workspace. Contact your workspace admin to re-enable them.",
    });
    const res = await POST(
      makeRequest({
        message: "the hs code is ABC123",
        currentTask: { intent: "create_hs_code", providedData: {} },
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_DISABLED");
  });

  it("resolves tenant AI settings using the authenticated tenant", async () => {
    await POST(makeRequest({ message: "create a new hs code for widgets" }));
    expect(mockResolveTenantAiSettings).toHaveBeenCalledWith(TENANT_A);
  });

  it("still returns 401 when tenantId is missing", async () => {
    mockAuth.mockResolvedValue(makeSession(undefined));
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(401);
  });
});
