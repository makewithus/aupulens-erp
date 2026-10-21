import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn(), deleteOne: vi.fn(),
  prefFindOne: vi.fn(), prefUpdate: vi.fn(), auth: vi.fn(), connect: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/ai/AiMemory", () => ({ default: { find: mocks.find, findById: mocks.findById, findOneAndUpdate: mocks.findOneAndUpdate, deleteOne: mocks.deleteOne } }));
vi.mock("@/models/ai/AiMemoryPreference", () => ({ default: { findOne: mocks.prefFindOne, findOneAndUpdate: mocks.prefUpdate } }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ default: mocks.connect }));

import { GET, POST, PATCH, DELETE } from "@/app/api/ai/memory/route";

const tenantId = "tenant-alpha";
const userId = "user-123";
const session = { user: { tenantId, id: userId, role: "admin" } };
function req(method: string, body?: unknown, url = "http://localhost/api/ai/memory") {
  return new Request(url, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) }) as any;
}
function query(result: unknown) {
  const chain: any = { sort: () => chain, limit: () => chain, select: () => chain, lean: async () => result };
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(session);
  mocks.find.mockReturnValue(query([]));
  mocks.prefFindOne.mockReturnValue(query(null));
  mocks.findOneAndUpdate.mockReturnValue(query({}));
  mocks.prefUpdate.mockReturnValue(query({ enabled: true }));
  mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
});

describe("AI memory controls", () => {
  it("rejects unauthenticated reads and writes", async () => {
    mocks.auth.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", { scope: "user", key: "stack", value: "MongoDB" }))).status).toBe(401);
  });

  it("lists only the current user's memories inside the authenticated tenant", async () => {
    mocks.find.mockReturnValueOnce(query([{ _id: "m1", scope: "user", key: `${userId}:stack`, value: "MongoDB" }]));
    const response = await GET(req("GET"));
    const body = await response.json();
    expect(body.data[0].key).toBe("stack");
    const filter = mocks.find.mock.calls[0][0];
    expect(filter.tenantId).toBe(tenantId);
    expect(filter.$or).toContainEqual({ scope: "user", ownerUserId: userId });
  });

  it("saves an explicitly approved, owner-scoped memory with provenance", async () => {
    await POST(req("POST", { scope: "user", key: "project stack", value: "Next.js and MongoDB", sourceConversationId: "conv-1" }));
    const [filter, update] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ tenantId, scope: "user", ownerUserId: userId, key: `${userId}:project stack` });
    expect(update.$set).toMatchObject({ approved: true, sourceConversationId: "conv-1", value: "Next.js and MongoDB" });
  });

  it("refuses to store credential-like content", async () => {
    const response = await POST(req("POST", { scope: "user", key: "database", value: "mongodb+srv://user:secret@example" }));
    expect(response.status).toBe(400);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("persists the memory-disabled preference", async () => {
    await POST(req("POST", { enabled: false }));
    expect(mocks.prefUpdate.mock.calls[0][0]).toEqual({ tenantId, userId });
    expect(mocks.prefUpdate.mock.calls[0][1].$set.enabled).toBe(false);
  });

  it("does not let non-admin users write shared workspace memories", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { ...session.user, role: "sales" } });
    const response = await POST(req("POST", { scope: "global", key: "rule", value: "value" }));
    expect(response.status).toBe(403);
  });

  it("updates and deletes only an authorized user's own memory", async () => {
    const memory: any = { _id: "m1", tenantId, scope: "user", ownerUserId: userId, value: "old", save: vi.fn() };
    mocks.findById.mockResolvedValue(memory);
    expect((await PATCH(req("PATCH", { id: "m1", value: "corrected" }))).status).toBe(200);
    expect(memory.value).toBe("corrected");
    expect(memory.save).toHaveBeenCalled();
    expect((await DELETE(req("DELETE", undefined, "http://localhost/api/ai/memory?id=m1"))).status).toBe(200);
    expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: "m1", tenantId });
  });
});
