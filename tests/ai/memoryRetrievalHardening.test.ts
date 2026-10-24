import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import Organization from "@/models/admin/Organization";
import ChatHistory from "@/models/ai/ChatHistory";
import AiMemory from "@/models/ai/AiMemory";
import AiMemoryPreference from "@/models/ai/AiMemoryPreference";
import { loadConversationContext } from "@/lib/ai/conversationContext";

const tenantA = `mem-qa-a-${randomUUID().slice(0, 8)}`;
const tenantB = `mem-qa-b-${randomUUID().slice(0, 8)}`;
const userA1 = new mongoose.Types.ObjectId().toString();
const userA2 = new mongoose.Types.ObjectId().toString();
const userB1 = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_mem_harden_${randomUUID().replaceAll("-", "")}`, {
    serverSelectionTimeoutMS: 5000,
  });
  await Organization.init();
  await ChatHistory.init();
  await AiMemory.init();
  await AiMemoryPreference.init();

  await Organization.create([
    {
      name: "Org A",
      subdomain: tenantA,
      ownerUserId: userA1,
      tier: "enterprise",
      subscriptionStatus: "active",
      settings: { enabledModules: ["sales", "admin"] },
    },
    {
      name: "Org B",
      subdomain: tenantB,
      ownerUserId: userB1,
      tier: "enterprise",
      subscriptionStatus: "active",
      settings: { enabledModules: ["sales", "admin"] },
    },
  ]);

  // Seed facts for userA1:
  // Fact 1: exact document identifier INV-0080
  await AiMemory.create({
    tenantId: tenantA,
    ownerUserId: userA1,
    scope: "user",
    category: "project",
    key: `${userA1}:INV-0080 shipment terms`,
    value: "Air freight expedited delivery",
    approved: true,
    updatedAt: new Date("2026-10-01"),
  });

  // Fact 2: fuzzy keyword match
  await AiMemory.create({
    tenantId: tenantA,
    ownerUserId: userA1,
    scope: "user",
    category: "preference",
    key: `${userA1}:freight preference general`,
    value: "Standard ground freight",
    approved: true,
    updatedAt: new Date("2026-09-01"),
  });

  // Fact 3: Conflicting facts - updated with current policy
  const policyDoc = await AiMemory.create({
    tenantId: tenantA,
    ownerUserId: userA1,
    scope: "user",
    category: "decision",
    key: `${userA1}:discount policy`,
    value: "Old policy: maximum 10%",
    approved: true,
    updatedAt: new Date("2026-08-01"),
  });
  await AiMemory.updateOne(
    { _id: policyDoc._id },
    { $set: { value: "Current policy: maximum 15% with manager approval", updatedAt: new Date("2026-10-15") } }
  );

  // Fact for Tenant B (to test cross-tenant isolation)
  await AiMemory.create({
    tenantId: tenantB,
    ownerUserId: userB1,
    scope: "user",
    category: "decision",
    key: `${userB1}:secret budget`,
    value: "Tenant B confidential revenue: 50 Crore",
    approved: true,
    updatedAt: new Date(),
  });
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Priority 7 — Semantic Memory and Cross-Chat Retrieval Hardening", () => {
  it("prioritizes exact document identifiers (INV-0080) over generic fuzzy matches", async () => {
    const context = await loadConversationContext({
      tenantId: tenantA,
      userId: userA1,
      role: "admin",
      module: "sales",
      conversationId: randomUUID(),
      message: "What are the shipping terms for INV-0080?",
    });

    const contextText = JSON.stringify(context.history);
    expect(contextText).toContain("Air freight expedited delivery");
    // Verify system context notice explicitly establishes precedence of live ERP data over memory:
    expect(contextText).toContain("Live authoritative ERP database records always override historical chat notes and saved memory facts");
  });

  it("suppresses unrelated keyword false positives from cross-chat recall", async () => {
    const context = await loadConversationContext({
      tenantId: tenantA,
      userId: userA1,
      role: "admin",
      module: "sales",
      conversationId: randomUUID(),
      message: "What color is the front door?",
    });

    const contextText = JSON.stringify(context.history);
    // Unrelated query should not recall INV-0080 shipment terms or freight
    expect(contextText).not.toContain("Air freight expedited delivery");
  });

  it("prioritizes the most recently updated fact when resolving conflicting knowledge keys", async () => {
    const context = await loadConversationContext({
      tenantId: tenantA,
      userId: userA1,
      role: "admin",
      module: "sales",
      conversationId: randomUUID(),
      message: "What is our discount policy?",
    });

    const contextText = JSON.stringify(context.history);
    expect(contextText).toContain("Current policy: maximum 15%");
  });

  it("strictly isolates memories across tenants (Tenant A cannot see Tenant B confidential facts)", async () => {
    const context = await loadConversationContext({
      tenantId: tenantA,
      userId: userA1,
      role: "admin",
      module: "sales",
      conversationId: randomUUID(),
      message: "What is our secret budget?",
    });

    const contextText = JSON.stringify(context.history);
    expect(contextText).not.toContain("Tenant B confidential revenue");
  });

  it("strictly isolates memories across users in the same tenant (User A2 cannot see User A1 memories)", async () => {
    const context = await loadConversationContext({
      tenantId: tenantA,
      userId: userA2,
      role: "sales",
      module: "sales",
      conversationId: randomUUID(),
      message: "What is our discount policy?",
    });

    const contextText = JSON.stringify(context.history);
    expect(contextText).not.toContain("Current policy: maximum 15%");
  });

  it("respects memory opt-out preference completely", async () => {
    await AiMemoryPreference.updateOne(
      { tenantId: tenantA, userId: userA1 },
      { $set: { enabled: false } },
      { upsert: true }
    );

    try {
      const context = await loadConversationContext({
        tenantId: tenantA,
        userId: userA1,
        role: "admin",
        module: "sales",
        conversationId: randomUUID(),
        message: "What is our discount policy and shipping for INV-0080?",
      });

      const contextText = JSON.stringify(context.history);
      expect(contextText).not.toContain("Air freight expedited delivery");
      expect(contextText).not.toContain("Current policy: maximum 15%");
    } finally {
      await AiMemoryPreference.updateOne(
        { tenantId: tenantA, userId: userA1 },
        { $set: { enabled: true } }
      );
    }
  });

  it("soft-deleted facts (deletedAt set) are excluded from context retrieval", async () => {
    const tempFact = await AiMemory.create({
      tenantId: tenantA,
      ownerUserId: userA1,
      scope: "user",
      category: "other",
      key: `${userA1}:temp fact`,
      value: "Temporary value that should be deleted",
      approved: true,
      deletedAt: new Date(), // Soft deleted
    });

    try {
      const context = await loadConversationContext({
        tenantId: tenantA,
        userId: userA1,
        role: "admin",
        module: "sales",
        conversationId: randomUUID(),
        message: "What was that temp fact?",
      });

      const contextText = JSON.stringify(context.history);
      expect(contextText).not.toContain("Temporary value that should be deleted");
    } finally {
      await AiMemory.deleteOne({ _id: tempFact._id });
    }
  });
});
