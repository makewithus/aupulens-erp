/**
 * Manufacturing chat-history persistence + cross-tenant isolation (Scope C).
 *
 * The Manufacturing assistant page had the chat-history sidebar UI but the API
 * routes it called did not exist (every save 404'd). These tests cover the new
 * routes and, critically, prove every read/write/delete is scoped by BOTH
 * userId AND tenantId AND module — so one workspace's manufacturing chats can
 * never surface in, or be mutated from, another workspace.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockConnectDB, mockFind, mockCreate, mockFindOneAndUpdate, mockFindOneAndDelete } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockFind: vi.fn(),
  mockCreate: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockFindOneAndDelete: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/models/ChatHistory", () => ({
  default: { find: mockFind, create: mockCreate, findOneAndUpdate: mockFindOneAndUpdate, findOneAndDelete: mockFindOneAndDelete },
}));

import { GET, POST, DELETE } from "@/app/api/manufacturing/chat-history/route";
import { PATCH } from "@/app/api/manufacturing/chat-history/archive/route";

function listChain(result: any[] = []) {
  const c: any = { sort: () => c, lean: () => Promise.resolve(result) };
  return c;
}
function req(body: any, url = "http://x/api/manufacturing/chat-history") {
  return { json: () => Promise.resolve(body), url } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockAuth.mockResolvedValue({ user: { id: "user-1", tenantId: "tenant-A" } });
  mockFind.mockReturnValue(listChain([]));
  mockCreate.mockResolvedValue({ _id: "chat-1", module: "manufacturing" });
  mockFindOneAndUpdate.mockResolvedValue({ _id: "chat-1", isArchived: true });
  mockFindOneAndDelete.mockResolvedValue({ _id: "chat-1" });
});

describe("manufacturing chat-history — persistence", () => {
  it("GET lists only this user's non-archived manufacturing chats, tenant-scoped", async () => {
    await GET(req({}, "http://x/api/manufacturing/chat-history"));
    expect(mockFind).toHaveBeenCalledWith({ userId: "user-1", tenantId: "tenant-A", module: "manufacturing", isArchived: false });
  });

  it("POST creates a chat stamped with module=manufacturing and a conversationId", async () => {
    const res = await POST(req({ title: "Ship SHP-1", messages: [{ role: "user", content: "hi", timestamp: new Date() }] }));
    expect(res.status).toBe(200);
    const created = mockCreate.mock.calls[0][0];
    expect(created).toMatchObject({ userId: "user-1", tenantId: "tenant-A", module: "manufacturing", isArchived: false });
    expect(typeof created.conversationId).toBe("string");
    expect(created.conversationId.length).toBeGreaterThan(0);
  });

  it("POST update targets the doc by id + tenant + module (never another tenant's)", async () => {
    await POST(req({ chatId: "chat-9", messages: [] }));
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "chat-9", userId: "user-1", tenantId: "tenant-A", module: "manufacturing" },
      { messages: [] },
      { new: true },
    );
  });
});

describe("manufacturing chat-history — cross-tenant isolation", () => {
  it("tenant B's GET is scoped to B, so it can never list A's chats", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", tenantId: "tenant-B" } });
    await GET(req({}, "http://x/api/manufacturing/chat-history"));
    const filter = mockFind.mock.calls[0][0];
    expect(filter.tenantId).toBe("tenant-B");
    expect(filter.tenantId).not.toBe("tenant-A");
  });

  it("DELETE is bound to the calling tenant — A cannot delete B's chat by id", async () => {
    await DELETE(req({}, "http://x/api/manufacturing/chat-history?chatId=chat-owned-by-B"));
    expect(mockFindOneAndDelete).toHaveBeenCalledWith({ _id: "chat-owned-by-B", userId: "user-1", tenantId: "tenant-A", module: "manufacturing" });
  });

  it("archive PATCH is bound to the calling tenant + module", async () => {
    const res = await PATCH(req({ chatId: "chat-1", isArchived: true }));
    expect(res.status).toBe(200);
    const filter = mockFindOneAndUpdate.mock.calls[0][0];
    expect(filter).toMatchObject({ tenantId: "tenant-A", module: "manufacturing" });
  });

  it("archive PATCH rejects a bad payload", async () => {
    const res = await PATCH(req({ chatId: "chat-1" })); // missing isArchived
    expect(res.status).toBe(400);
  });
});
