/**
 * RAG retrieval tests (Scope E).
 *
 * Focus on the two things that must hold regardless of infra: (1) when Atlas
 * Vector Search is unavailable, retrieval falls back to cosine and ranks by
 * similarity; (2) the cosine fallback query is tenant-scoped. The full pipeline
 * (real embeddings + grounded gpt-4o answer) is covered by scripts/verify-rag.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConnectDB, mockAggregate, mockFind, mockEmbed } = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockAggregate: vi.fn(),
  mockFind: vi.fn(),
  mockEmbed: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/models/ai/AiEmbedding", () => ({ default: { aggregate: mockAggregate, find: mockFind } }));
vi.mock("@/models/sales/SalesInvoice", () => ({ SalesInvoice: { find: vi.fn() } }));
vi.mock("@/models/crm/Activity", () => ({ default: { find: vi.fn() } }));
vi.mock("@/lib/ai/claude", () => ({ embedText: mockEmbed, EMBEDDING_DEFAULT_MODEL: "text-embedding-ada-002" }));
vi.mock("@/lib/ai/tenantAi", () => ({ resolveTenantAiSettings: vi.fn(), callClaudeForTenant: vi.fn() }));

import { retrieve } from "@/lib/ai/rag";

beforeEach(() => {
  vi.clearAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
});

describe("retrieve — cosine fallback", () => {
  it("falls back to cosine (ranking by similarity) when Atlas Vector Search errors", async () => {
    mockAggregate.mockRejectedValue(new Error("no vector index"));
    // Stored vectors: doc-close is nearly parallel to the query [1,0]; doc-far is orthogonal.
    mockFind.mockReturnValue({
      lean: () => Promise.resolve([
        { sourceType: "invoice", sourceId: "far", text: "far", embedding: [0, 1] },
        { sourceType: "invoice", sourceId: "close", text: "close", embedding: [1, 0.05] },
      ]),
    });

    const { chunks, method } = await retrieve("tenant-A", [1, 0], 5);
    expect(method).toBe("cosine_fallback");
    expect(chunks[0].sourceId).toBe("close"); // most similar ranked first
    expect(chunks[0].score).toBeGreaterThan(chunks[1].score);
  });

  it("scopes the cosine fallback query to the calling tenant", async () => {
    mockAggregate.mockRejectedValue(new Error("no index"));
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    await retrieve("tenant-B", [1, 0], 5);
    expect(mockFind).toHaveBeenCalledWith(
      { tenantId: "tenant-B" },
      expect.objectContaining({ embedding: 1 }),
    );
  });

  it("uses Atlas Vector Search results when available (no fallback)", async () => {
    mockAggregate.mockResolvedValue([{ sourceType: "invoice", sourceId: "v1", text: "vec", score: 0.9 }]);
    const { chunks, method } = await retrieve("tenant-A", [1, 0], 5);
    expect(method).toBe("vector_search");
    expect(chunks[0].sourceId).toBe("v1");
    expect(mockFind).not.toHaveBeenCalled();
  });
});
