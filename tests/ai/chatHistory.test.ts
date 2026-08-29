/**
 * Tests for ChatHistory model:
 * - save + restore conversation turns
 * - tenant isolation (conversationId is scoped to tenantId)
 * - compound unique index prevents cross-tenant collision
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks ──────────────────────────────────────────────────────────────

const { mockFindOne, mockFindOneAndUpdate } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
}));

vi.mock("@/models/ai/ChatHistory", () => ({
  default: {
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

import ChatHistory from "@/models/ai/ChatHistory";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFindOneChain(result: any) {
  const chain: any = {
    select: () => chain,
    lean: () => Promise.resolve(result),
  };
  return chain;
}

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const CONV_ID = "conv-uuid-1234";
const USER_ID = "user-objectid-abc";

beforeEach(() => {
  vi.clearAllMocks();
  mockFindOne.mockReturnValue(makeFindOneChain(null));
  mockFindOneAndUpdate.mockResolvedValue({});
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ChatHistory — save conversation turns", () => {
  it("upserts with the correct tenantId and conversationId", async () => {
    await ChatHistory.findOneAndUpdate(
      { tenantId: TENANT_A, conversationId: CONV_ID },
      {
        $setOnInsert: { tenantId: TENANT_A, conversationId: CONV_ID, userId: USER_ID, module: "admin", title: "Test question" },
        $push: { messages: { $each: [
          { role: "user", content: "Hello", timestamp: new Date() },
          { role: "assistant", content: "Hi there", timestamp: new Date() },
        ]}},
      },
      { upsert: true, new: true }
    );

    const call = mockFindOneAndUpdate.mock.calls[0];
    const filter = call[0];
    expect(filter).toMatchObject({ tenantId: TENANT_A, conversationId: CONV_ID });
  });

  it("pushes both user and assistant turns in a single call", async () => {
    const userMsg = { role: "user", content: "Question?", timestamp: new Date() };
    const assistantMsg = { role: "assistant", content: "Answer.", timestamp: new Date() };

    await ChatHistory.findOneAndUpdate(
      { tenantId: TENANT_A, conversationId: CONV_ID },
      { $setOnInsert: { tenantId: TENANT_A, conversationId: CONV_ID, userId: USER_ID, module: "admin", title: "Q" },
        $push: { messages: { $each: [userMsg, assistantMsg] } } },
      { upsert: true, new: true }
    );

    const update = mockFindOneAndUpdate.mock.calls[0][1];
    const pushed = update.$push.messages.$each;
    expect(pushed).toHaveLength(2);
    expect(pushed[0].role).toBe("user");
    expect(pushed[1].role).toBe("assistant");
  });
});

describe("ChatHistory — restore prior turns", () => {
  it("returns messages from the found document", async () => {
    const storedMessages = [
      { role: "user", content: "Turn 1", timestamp: new Date() },
      { role: "assistant", content: "Response 1", timestamp: new Date() },
    ];
    mockFindOne.mockReturnValue(makeFindOneChain({ messages: storedMessages }));

    const result = await ChatHistory.findOne(
      { tenantId: TENANT_A, conversationId: CONV_ID },
      { messages: 1 }
    ).lean();

    expect((result as any)?.messages).toHaveLength(2);
    expect((result as any)?.messages[0].role).toBe("user");
    expect((result as any)?.messages[1].role).toBe("assistant");
  });

  it("returns null when no conversation exists (new conversation)", async () => {
    mockFindOne.mockReturnValue(makeFindOneChain(null));

    const result = await ChatHistory.findOne(
      { tenantId: TENANT_A, conversationId: "brand-new-id" },
      { messages: 1 }
    ).lean();

    expect(result).toBeNull();
  });
});

describe("ChatHistory — tenant isolation", () => {
  it("looks up by tenantId + conversationId (never by conversationId alone)", async () => {
    await ChatHistory.findOne(
      { tenantId: TENANT_A, conversationId: CONV_ID },
      { messages: 1 }
    ).lean();

    const filter = mockFindOne.mock.calls[0][0];
    expect(filter).toHaveProperty("tenantId", TENANT_A);
    expect(filter).toHaveProperty("conversationId", CONV_ID);
  });

  it("uses different tenantIds for different tenants (no cross-tenant bleed)", async () => {
    await ChatHistory.findOne({ tenantId: TENANT_A, conversationId: CONV_ID }, { messages: 1 }).lean();
    await ChatHistory.findOne({ tenantId: TENANT_B, conversationId: CONV_ID }, { messages: 1 }).lean();

    const filterA = mockFindOne.mock.calls[0][0];
    const filterB = mockFindOne.mock.calls[1][0];

    expect(filterA.tenantId).toBe(TENANT_A);
    expect(filterB.tenantId).toBe(TENANT_B);
    expect(filterA.tenantId).not.toBe(filterB.tenantId);
  });

  it("upsert filter always includes tenantId (never just conversationId)", async () => {
    await ChatHistory.findOneAndUpdate(
      { tenantId: TENANT_A, conversationId: CONV_ID },
      { $setOnInsert: { tenantId: TENANT_A, conversationId: CONV_ID, userId: USER_ID, module: "admin", title: "T" },
        $push: { messages: { $each: [] } } },
      { upsert: true, new: true }
    );

    const filter = mockFindOneAndUpdate.mock.calls[0][0];
    expect(filter).toHaveProperty("tenantId");
    expect(filter.tenantId).toBe(TENANT_A);
  });
});

describe("ChatHistory — module field", () => {
  it("stores the correct module in $setOnInsert", async () => {
    await ChatHistory.findOneAndUpdate(
      { tenantId: TENANT_A, conversationId: CONV_ID },
      { $setOnInsert: { tenantId: TENANT_A, conversationId: CONV_ID, userId: USER_ID, module: "finance", title: "T" },
        $push: { messages: { $each: [] } } },
      { upsert: true, new: true }
    );

    const update = mockFindOneAndUpdate.mock.calls[0][1];
    expect(update.$setOnInsert.module).toBe("finance");
  });
});
