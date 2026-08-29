/**
 * Regression test: finance AI assistant route.
 *
 * Verifies:
 * 1. Auth guard rejects missing tenantId.
 * 2. Every DB query (JournalEntry, Invoice) is scoped to tenantId.
 * 3. Accounting report helpers receive tenantId.
 * 4. Response shape includes { response, conversationId }.
 * 5. conversationId is generated when not supplied, reused when supplied.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks so they are available inside vi.mock() factories ─────────────

const {
  mockAuth,
  mockConnectDB,
  mockJeFind,
  mockInvoiceFind,
  mockBuildPostedJournalReport,
  mockBuildPostedIncomeExpenseSeries,
  mockResolveTenantAiSettings,
  mockCallClaudeForTenant,
  mockChatHistoryFindOne,
  mockChatHistoryFindOneAndUpdate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockJeFind: vi.fn(),
  mockInvoiceFind: vi.fn(),
  mockBuildPostedJournalReport: vi.fn(),
  mockBuildPostedIncomeExpenseSeries: vi.fn(),
  mockResolveTenantAiSettings: vi.fn(),
  mockCallClaudeForTenant: vi.fn(),
  mockChatHistoryFindOne: vi.fn(),
  mockChatHistoryFindOneAndUpdate: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));

vi.mock("@/models/finance/JournalEntry", () => ({
  default: { find: mockJeFind },
}));

vi.mock("@/models/finance/Invoice", () => ({
  default: { find: mockInvoiceFind },
}));

vi.mock("@/lib/accounting/reports", () => ({
  buildPostedJournalReport: mockBuildPostedJournalReport,
  buildPostedIncomeExpenseSeries: mockBuildPostedIncomeExpenseSeries,
}));

// The route now goes through the tenant-aware wrapper (Phase 0 follow-up:
// bare callClaude()/callClaudeWithHistory() skipped the kill-switch/monthly
// cap entirely) — mock that wrapper instead of the underlying client.
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

// ─── Import handler after all mocks are registered ───────────────────────────

import { POST } from "@/app/api/finance/ai-assistant/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";

function makeSession(tenantId: string | undefined) {
  return {
    user: { id: "user-1", role: "finance", tenantId },
  };
}

function buildChain(result: any = []) {
  const chain: any = {
    sort: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(result),
  };
  return chain;
}

function makeRequest(body: Record<string, any>) {
  return { json: () => Promise.resolve(body) } as any;
}

function makeLedgerReport() {
  return {
    income: { total: 100000 },
    expense: { total: 40000 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: auth succeeds with TENANT_A
  mockAuth.mockResolvedValue(makeSession(TENANT_A));
  mockConnectDB.mockResolvedValue(undefined);

  // Default DB responses
  mockJeFind.mockReturnValue(buildChain([]));
  mockInvoiceFind.mockReturnValue(buildChain([]));
  mockBuildPostedJournalReport.mockResolvedValue(makeLedgerReport());
  mockBuildPostedIncomeExpenseSeries.mockResolvedValue([]);

  // Default: tenant is ungated, default tier/settings; AI call succeeds.
  mockResolveTenantAiSettings.mockResolvedValue({ tier: "starter", aiSettings: {} });
  mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: "Finance overview response." });

  // Default: no prior ChatHistory
  mockChatHistoryFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  mockChatHistoryFindOneAndUpdate.mockResolvedValue({});
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("finance/ai-assistant — auth guards", () => {
  it("returns 401 when session is missing", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session.user.role is not finance", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin", tenantId: TENANT_A } });
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when tenantId is missing", async () => {
    mockAuth.mockResolvedValue(makeSession(undefined));
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});

describe("finance/ai-assistant — tenant isolation (DB query scoping)", () => {
  it("JournalEntry.find always receives tenantId", async () => {
    await POST(makeRequest({ message: "show transactions" }));
    expect(mockJeFind).toHaveBeenCalled();
    const filter = mockJeFind.mock.calls[0][0];
    expect(filter).toMatchObject({ tenantId: TENANT_A });
  });

  it("Invoice.find for sales invoices always receives tenantId", async () => {
    await POST(makeRequest({ message: "show invoices" }));
    // First call is out_invoice, second is in_invoice
    const calls = mockInvoiceFind.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][0]).toMatchObject({ tenantId: TENANT_A, moveType: "out_invoice" });
  });

  it("Invoice.find for bills always receives tenantId", async () => {
    await POST(makeRequest({ message: "show bills" }));
    const calls = mockInvoiceFind.mock.calls;
    expect(calls[1][0]).toMatchObject({ tenantId: TENANT_A, moveType: "in_invoice" });
  });

  it("buildPostedJournalReport always receives tenantId", async () => {
    await POST(makeRequest({ message: "show ledger" }));
    expect(mockBuildPostedJournalReport).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A })
    );
  });

  it("buildPostedIncomeExpenseSeries always receives tenantId", async () => {
    await POST(makeRequest({ message: "show monthly revenue" }));
    expect(mockBuildPostedIncomeExpenseSeries).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A })
    );
  });

  it("does not use TENANT_B queries when called with TENANT_A", async () => {
    await POST(makeRequest({ message: "overview" }));
    const allFilters = [
      ...mockJeFind.mock.calls.map((c) => c[0]),
      ...mockInvoiceFind.mock.calls.map((c) => c[0]),
    ];
    for (const f of allFilters) {
      expect(f.tenantId).not.toBe(TENANT_B);
    }
  });
});

describe("finance/ai-assistant — response shape", () => {
  it("returns { response, conversationId }", async () => {
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("response");
    expect(body).toHaveProperty("conversationId");
    expect(typeof body.conversationId).toBe("string");
  });

  it("generates a new UUID when no conversationId is supplied", async () => {
    const res = await POST(makeRequest({ message: "hello" }));
    const body = await res.json();
    expect(body.conversationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("reuses the conversationId when one is provided", async () => {
    const cid = "fixed-conv-id-abc";
    const res = await POST(makeRequest({ message: "hello", conversationId: cid }));
    const body = await res.json();
    expect(body.conversationId).toBe(cid);
  });
});

describe("finance/ai-assistant — ChatHistory wiring", () => {
  it("looks up prior history by tenantId + conversationId", async () => {
    const cid = "existing-conv";
    await POST(makeRequest({ message: "hello", conversationId: cid }));
    expect(mockChatHistoryFindOne).toHaveBeenCalledWith(
      { tenantId: TENANT_A, conversationId: cid },
      { messages: 1 }
    );
  });

  it("upsert filter always includes tenantId (not just conversationId)", async () => {
    await POST(makeRequest({ message: "what is profit?" }));
    const upsertFilter = mockChatHistoryFindOneAndUpdate.mock.calls[0][0];
    expect(upsertFilter).toHaveProperty("tenantId", TENANT_A);
    expect(upsertFilter).toHaveProperty("conversationId");
  });

  it("upsert $setOnInsert sets module=finance", async () => {
    await POST(makeRequest({ message: "revenue?" }));
    const update = mockChatHistoryFindOneAndUpdate.mock.calls[0][1];
    expect(update.$setOnInsert).toMatchObject({ module: "finance", tenantId: TENANT_A });
  });

  it("passes prior turns through to callClaudeForTenant's history option", async () => {
    mockChatHistoryFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          messages: [
            { role: "user", content: "first question" },
            { role: "assistant", content: "first answer" },
          ],
        }),
    });
    await POST(makeRequest({ message: "follow-up?" }));
    const opts = mockCallClaudeForTenant.mock.calls[0][4];
    expect(opts.history).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);
  });

  it("passes an empty history for a fresh conversation", async () => {
    await POST(makeRequest({ message: "fresh question" }));
    const opts = mockCallClaudeForTenant.mock.calls[0][4];
    expect(opts.history).toEqual([]);
  });
});

describe("finance/ai-assistant — tenant AI gating (kill-switch / monthly cap)", () => {
  it("returns 403 with AI_DISABLED and does not persist ChatHistory when the workspace AI kill-switch is on", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_DISABLED",
      error: "AI features are disabled for this workspace. Contact your workspace admin to re-enable them.",
    });
    const res = await POST(makeRequest({ message: "revenue?" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_DISABLED");
    expect(mockChatHistoryFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 with AI_LIMIT_REACHED and does not persist ChatHistory when the monthly cap is hit", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_LIMIT_REACHED",
      error: "Monthly AI call limit reached (100 / 100 calls used this month).",
      currentTier: "starter",
      requiredAction: "upgrade",
    });
    const res = await POST(makeRequest({ message: "revenue?" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AI_LIMIT_REACHED");
    expect(body.requiredAction).toBe("upgrade");
    expect(mockChatHistoryFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("resolves tenant AI settings using the authenticated tenant, not a hardcoded one", async () => {
    await POST(makeRequest({ message: "revenue?" }));
    expect(mockResolveTenantAiSettings).toHaveBeenCalledWith(TENANT_A);
  });
});
