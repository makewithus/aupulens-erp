/**
 * Cross-tenant AI memory isolation (two-model completion pass).
 *
 * The module assistants restore prior conversation turns from ChatHistory.
 * If that lookup weren't scoped by tenantId, tenant A's assistant could be
 * fed tenant B's conversation history — a real cross-tenant data leak. This
 * proves every ChatHistory read is scoped to the *calling* tenant, so B's
 * documents (tenantId: B) can never match A's query.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAuth, mockConnectDB, mockJeFind, mockInvoiceFind,
  mockBuildReport, mockBuildSeries, mockResolveTenantAiSettings,
  mockCallClaudeForTenant, mockChatHistoryFindOne, mockChatHistoryUpsert,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(), mockConnectDB: vi.fn(), mockJeFind: vi.fn(), mockInvoiceFind: vi.fn(),
  mockBuildReport: vi.fn(), mockBuildSeries: vi.fn(), mockResolveTenantAiSettings: vi.fn(),
  mockCallClaudeForTenant: vi.fn(), mockChatHistoryFindOne: vi.fn(), mockChatHistoryUpsert: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/models/JournalEntry", () => ({ default: { find: mockJeFind } }));
vi.mock("@/models/Invoice", () => ({ default: { find: mockInvoiceFind } }));
vi.mock("@/lib/accounting/reports", () => ({
  buildPostedJournalReport: mockBuildReport,
  buildPostedIncomeExpenseSeries: mockBuildSeries,
}));
vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: mockResolveTenantAiSettings,
  callClaudeForTenant: mockCallClaudeForTenant,
}));
vi.mock("@/models/ChatHistory", () => ({
  default: { findOne: mockChatHistoryFindOne, findOneAndUpdate: mockChatHistoryUpsert },
}));

import { POST } from "@/app/api/finance/ai-assistant/route";

function chain(result: any = []) {
  const c: any = { sort: () => c, limit: () => c, lean: () => Promise.resolve(result) };
  return c;
}
function req(body: any) { return { json: () => Promise.resolve(body) } as any; }

beforeEach(() => {
  vi.clearAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockJeFind.mockReturnValue(chain([]));
  mockInvoiceFind.mockReturnValue(chain([]));
  mockBuildReport.mockResolvedValue({ income: { total: 0 }, expense: { total: 0 } });
  mockBuildSeries.mockResolvedValue([]);
  mockResolveTenantAiSettings.mockResolvedValue({ tier: "starter", aiSettings: {} });
  mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: "answer" });
  mockChatHistoryUpsert.mockResolvedValue({});
});

describe("finance/ai-assistant — cross-tenant AI memory isolation", () => {
  it("reads ChatHistory scoped to the CALLING tenant (A), never another tenant", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "finance", tenantId: "tenant-A" } });
    mockChatHistoryFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    await POST(req({ message: "hi", conversationId: "conv-shared-id" }));

    const filter = mockChatHistoryFindOne.mock.calls[0][0];
    expect(filter.tenantId).toBe("tenant-A");
    expect(filter.tenantId).not.toBe("tenant-B");
  });

  it("tenant B's identical conversationId query is scoped to B, so it can't read A's history", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "finance", tenantId: "tenant-B" } });
    mockChatHistoryFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    await POST(req({ message: "hi", conversationId: "conv-shared-id" }));

    const filter = mockChatHistoryFindOne.mock.calls[0][0];
    // Same conversationId, but the query is bound to B — A's doc (tenantId:A) cannot match.
    expect(filter).toMatchObject({ tenantId: "tenant-B", conversationId: "conv-shared-id" });
  });

  it("persists new turns scoped to the calling tenant too (write side isolation)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "finance", tenantId: "tenant-A" } });
    mockChatHistoryFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    await POST(req({ message: "what is profit?" }));

    const upsertFilter = mockChatHistoryUpsert.mock.calls[0][0];
    expect(upsertFilter.tenantId).toBe("tenant-A");
  });
});
