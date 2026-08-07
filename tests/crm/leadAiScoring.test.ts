/**
 * Regression test: CRM lead routes now score leads via a real LLM call
 * (lib/crm/leadScoring.ts's scoreLeadWithAi), falling back to the
 * deterministic calculateLeadScore() when AI is gated/unavailable, and
 * persist a CrmAIInsight record only when the AI call actually ran.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAuth,
  mockConnectDB,
  mockRequireRole,
  mockDetectDuplicates,
  mockLeadFindOne,
  mockLeadFind,
  mockLeadCreate,
  mockActivityCreate,
  mockResolveTenantAiSettings,
  mockCallClaudeForTenant,
  mockAiInsightCreate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockRequireRole: vi.fn(),
  mockDetectDuplicates: vi.fn(),
  mockLeadFindOne: vi.fn(),
  mockLeadFind: vi.fn(),
  mockLeadCreate: vi.fn(),
  mockActivityCreate: vi.fn(),
  mockResolveTenantAiSettings: vi.fn(),
  mockCallClaudeForTenant: vi.fn(),
  mockAiInsightCreate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/lib/crm/rbac", () => ({ requireRole: mockRequireRole }));
// The route uses the AI-assisted dedup wrapper; mock it to return the same
// shape ({ aiUsed, duplicates }). mockDetectDuplicates supplies the array.
vi.mock("@/lib/crm/ai/duplicateAssistant", () => ({
  detectDuplicatesWithAi: (..._a: any[]) => Promise.resolve({ aiUsed: false, duplicates: mockDetectDuplicates() }),
}));

vi.mock("@/models/crm/Lead", () => ({
  default: {
    findOne: mockLeadFindOne,
    // Chainable stub: the dedup candidate query now uses .sort()/.limit()/.lean().
    find: (...args: any[]) => {
      mockLeadFind(...args);
      const chain: any = { sort: () => chain, limit: () => chain, lean: () => Promise.resolve([]) };
      return chain;
    },
    create: mockLeadCreate,
  },
}));
vi.mock("@/models/crm/Activity", () => ({ default: { create: mockActivityCreate } }));

vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: mockResolveTenantAiSettings,
  callClaudeForTenant: mockCallClaudeForTenant,
}));

vi.mock("@/models/crm/AIInsight", () => ({ default: { create: mockAiInsightCreate } }));

import { POST } from "@/app/api/crm/leads/route";

const TENANT_A = "tenant-alpha";

function makeSession() {
  return { user: { id: "user-1", role: "sales", tenantId: TENANT_A } };
}

function makeRequest(body: Record<string, any>) {
  return { json: () => Promise.resolve(body) } as any;
}

function makeLeadBody() {
  return { lead_name: "Jane Doe", source: "Referral", owner_id: "owner-1", company_name: "Acme" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeSession());
  mockConnectDB.mockResolvedValue(undefined);
  mockRequireRole.mockReturnValue(undefined);
  mockLeadFindOne.mockResolvedValue(null); // no exact-match duplicate
  mockDetectDuplicates.mockReturnValue([]); // no fuzzy duplicate
  mockResolveTenantAiSettings.mockResolvedValue({ tier: "starter", aiSettings: {} });
  mockLeadCreate.mockImplementation(async (doc: any) => ({ ...doc, _id: "lead-1" }));
  mockActivityCreate.mockResolvedValue({});
  mockAiInsightCreate.mockResolvedValue({});
});

describe("POST /api/crm/leads — AI scoring", () => {
  it("uses the LLM's score when the AI call succeeds", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: false,
      text: JSON.stringify({ score: 91, confidence: 80, summary: "Strong lead", reasoning: "Referral + budget" }),
    });
    const res = await POST(makeRequest(makeLeadBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.lead_score).toBe(91);
  });

  it("records a CrmAIInsight when the AI call succeeds", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: false,
      text: JSON.stringify({ score: 91, confidence: 80, summary: "Strong lead", reasoning: "Referral + budget" }),
    });
    await POST(makeRequest(makeLeadBody()));
    expect(mockAiInsightCreate).toHaveBeenCalledTimes(1);
    const insight = mockAiInsightCreate.mock.calls[0][0];
    expect(insight.entityType).toBe("Lead");
    expect(insight.tenantId).toBe(TENANT_A);
    expect(insight.confidence).toBe(80);
  });

  it("falls back to the deterministic score and does NOT record an insight when AI is gated (kill-switch)", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_DISABLED",
      error: "AI features are disabled for this workspace.",
    });
    const res = await POST(makeRequest(makeLeadBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    // calculateLeadScore(body): company_name(10) + source Referral(15) = 25
    expect(body.data.lead_score).toBe(25);
    expect(mockAiInsightCreate).not.toHaveBeenCalled();
  });

  it("falls back to the deterministic score and does NOT record an insight when the AI call throws", async () => {
    mockCallClaudeForTenant.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(makeLeadBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.lead_score).toBe(25);
    expect(mockAiInsightCreate).not.toHaveBeenCalled();
  });

  it("still creates the lead successfully (not blocked by AI) when the model reply is unparseable", async () => {
    mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: "not json" });
    const res = await POST(makeRequest(makeLeadBody()));
    expect(res.status).toBe(200);
    expect(mockLeadCreate).toHaveBeenCalled();
  });
});
