import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ chatFindOne: vi.fn(), chatFind: vi.fn(), memoryFind: vi.fn(), preferenceFindOne: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/ai/ChatHistory", () => ({ default: { findOne: mocks.chatFindOne, find: mocks.chatFind } }));
vi.mock("@/models/ai/AiMemory", () => ({ default: { find: mocks.memoryFind } }));
vi.mock("@/models/ai/AiMemoryPreference", () => ({ default: { findOne: mocks.preferenceFindOne } }));

import { loadConversationContext } from "@/lib/ai/conversationContext";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chatFindOne.mockReturnValue({ lean: async () => null });
  mocks.chatFind.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
  mocks.memoryFind.mockReturnValue({ sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [] }) }) }) });
});

describe("cross-chat memory preference failures", () => {
  it("fails closed and does not query prior chats or saved facts if the preference cannot be read", async () => {
    mocks.preferenceFindOne.mockReturnValue({ select: () => ({ lean: async () => { throw new Error("database unavailable"); } }) });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await loadConversationContext({
      tenantId: "tenant-a", userId: "user-a", role: "sales", module: "sales",
      conversationId: "current", message: "What did we discuss in the previous chat?",
    });

    expect(result.conversationId).toBe("current");
    expect(mocks.chatFind).not.toHaveBeenCalled();
    expect(mocks.memoryFind).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
