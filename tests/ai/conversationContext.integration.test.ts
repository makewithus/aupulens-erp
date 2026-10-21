import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import ChatHistory from "@/models/ai/ChatHistory";
import { loadConversationContext, saveCompletedExchange } from "@/lib/ai/conversationContext";
const tenant = `memory-${randomUUID()}`;
const user = new mongoose.Types.ObjectId();
const otherUser = new mongoose.Types.ObjectId();
const input = { tenantId: tenant, userId: String(user), role: "admin", module: "admin" as const, conversationId: "current", message: "What was discussed in the previous chat?" };
async function chat(conversationId: string, content: string, extras: Record<string, unknown> = {}) {
  return ChatHistory.create({ tenantId: tenant, userId: user, module: "admin", conversationId, title: conversationId, messages: [{ role: "user", content }], ...extras });
}
beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_chat_memory_${randomUUID().slice(0, 8)}`, { serverSelectionTimeoutMS: 3000 });
  await ChatHistory.init();
});
beforeEach(async () => { await ChatHistory.deleteMany({}); });
afterAll(async () => { if (mongoose.connection.readyState === 1) await ChatHistory.deleteMany({}); await mongoose.disconnect(); });
describe("saved chat retrieval and persistence", () => {
  it("recalls the user's prior chat while excluding other users, tenants and archived chats", async () => {
    await chat("previous", "Orchid needs delivery on Friday");
    await chat("other-user", "OTHER_USER_SECRET", { userId: otherUser });
    await chat("other-tenant", "OTHER_TENANT_SECRET", { tenantId: "different" });
    await chat("archived", "ARCHIVED_SECRET", { isArchived: true });
    const result = await loadConversationContext(input);
    const text = JSON.stringify(result.history);
    expect(text).toContain("Orchid needs delivery on Friday");
    for (const secret of ["OTHER_USER_SECRET", "OTHER_TENANT_SECRET", "ARCHIVED_SECRET"]) expect(text).not.toContain(secret);
  });
  it("restores the complete active chat and ignores unverified client history", async () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `active fact ${i}` }));
    await chat("current", "", { messages });
    const result = await loadConversationContext({ ...input, history: [...messages.slice(-2), { role: "user", content: "live unsaved fact" }] });
    expect(result.history).toHaveLength(41);
    expect(result.history[1].content).toBe("active fact 0");
    expect(result.history.at(-1)?.content).toBe("active fact 39");
    expect(JSON.stringify(result.history)).not.toContain("live unsaved fact");
    expect(result.history[0].content).not.toContain("active fact");
  });
  it("retrieves matching older chats beyond the recent-chat window", async () => {
    await chat("old-match", "The ORCHID-748 supplier requires cold storage", { updatedAt: new Date("2020-01-01") });
    for (let i = 0; i < 6; i++) await chat(`recent-${i}`, "Unrelated recent discussion");
    const result = await loadConversationContext({ ...input, message: "What did we decide for ORCHID-748?" });
    expect(result.history[0].content).toContain("cold storage");
  });
  it("respects current role access when recalling chats from other modules", async () => {
    await chat("finance-old", "FINANCE_FACT", { module: "finance" });
    await chat("hr-old", "HR_PRIVATE_FACT", { module: "hr" });
    const result = await loadConversationContext({ ...input, role: "finance", module: "finance" });
    expect(result.history[0].content).toContain("FINANCE_FACT");
    expect(result.history[0].content).not.toContain("HR_PRIVATE_FACT");
  });
  it("resumes a selected chat by its owner-scoped database id and saves completed streams durably", async () => {
    const saved = await chat("saved-id", "remember this");
    const result = await loadConversationContext({ ...input, chatId: String(saved._id) });
    expect(result.conversationId).toBe("saved-id");
    await saveCompletedExchange({ ...input, conversationId: result.conversationId, response: "remembered" });
    const reloaded = await loadConversationContext({ ...input, conversationId: "saved-id" });
    expect(reloaded.history.at(-1)?.content).toBe("remembered");
    const other = await loadConversationContext({ ...input, userId: String(otherUser), chatId: String(saved._id) });
    expect(JSON.stringify(other.history)).not.toContain("remember this");
  });
});
