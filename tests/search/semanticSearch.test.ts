/**
 * Semantic search gating + merge tests (Scope G).
 *
 * The important guarantees: semantic hits are role-gated the same way keyword
 * hits are, they're skipped (never error) when embeddings aren't configured,
 * and merging keeps keyword as the baseline while de-duplicating. The live
 * "finds what keyword misses" behavior is covered by
 * scripts/verify-semantic-search.ts against real embeddings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEmbed, mockRetrieve, state, empty } = vi.hoisted(() => ({
  mockEmbed: vi.fn(),
  mockRetrieve: vi.fn(),
  state: { embeddingModel: "text-embedding-ada-002" },
  empty: { find: () => ({ select: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }) },
}));

// Mock the DB + every model imported at the top of universalSearch so the
// module loads without a live Mongo connection.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/crm/Lead", () => ({ default: empty }));
vi.mock("@/models/crm/Account", () => ({ default: empty }));
vi.mock("@/models/crm/Contact", () => ({ default: empty }));
vi.mock("@/models/crm/Opportunity", () => ({ default: empty }));
vi.mock("@/models/SalesInvoice", () => ({ SalesInvoice: empty }));
vi.mock("@/models/Customer", () => ({ default: empty }));
vi.mock("@/models/SaleOrder", () => ({ default: empty }));
vi.mock("@/models/InventoryItem", () => ({ default: empty }));
vi.mock("@/models/Employee", () => ({ default: empty }));
vi.mock("@/models/Project", () => ({ default: empty }));

// Embedding client + RAG retrieval — the semantic layer's dependencies.
vi.mock("@/lib/ai/claude", () => ({ get EMBEDDING_DEFAULT_MODEL() { return state.embeddingModel; }, embedText: mockEmbed }));
vi.mock("@/lib/ai/rag", () => ({ retrieve: mockRetrieve }));

import { runSemanticSearch, runCombinedSearch } from "@/lib/search/universalSearch";

beforeEach(() => {
  vi.clearAllMocks();
  state.embeddingModel = "text-embedding-ada-002";
  mockEmbed.mockResolvedValue([0.1, 0.2, 0.3]);
  mockRetrieve.mockResolvedValue({ chunks: [{ sourceType: "invoice", sourceId: "inv1", text: "Invoice INV-1 total 500 overdue", score: 0.83 }], method: "cosine_fallback" });
});

describe("runSemanticSearch — gating", () => {
  it("returns semantic results for an admin", async () => {
    const res = await runSemanticSearch("t1", "admin", "money owed");
    expect(res.length).toBe(1);
    expect(res[0].type).toContain("semantic");
    expect(res[0].url).toContain("/sales/invoices/inv1");
  });

  it("returns [] for a role that can't see the indexed (CRM/Sales) sources", async () => {
    const res = await runSemanticSearch("t1", "hr", "money owed");
    expect(res).toEqual([]);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("returns [] (no throw) when embeddings aren't configured", async () => {
    state.embeddingModel = "";
    const res = await runSemanticSearch("t1", "admin", "money owed");
    expect(res).toEqual([]);
  });

  it("returns [] when retrieval throws (keyword results still stand)", async () => {
    mockRetrieve.mockRejectedValue(new Error("no index"));
    const res = await runSemanticSearch("t1", "admin", "money owed");
    expect(res).toEqual([]);
  });
});

describe("runCombinedSearch — merge", () => {
  it("keyword-only when semantic is off", async () => {
    const { results, semanticUsed } = await runCombinedSearch("t1", "admin", "anything", { semantic: false });
    expect(semanticUsed).toBe(false);
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(Array.isArray(results)).toBe(true);
  });

  it("merges semantic on top of keyword when enabled", async () => {
    const { results, semanticUsed } = await runCombinedSearch("t1", "admin", "money owed", { semantic: true });
    expect(semanticUsed).toBe(true);
    expect(results.some((r) => r.id === "inv1")).toBe(true);
  });
});
