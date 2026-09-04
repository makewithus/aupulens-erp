import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_attention";

import AiAttentionItem from "@/models/ai/AiAttentionItem";

let createAttentionItem: typeof import("@/lib/aiRuntime/attention/attentionEngine").createAttentionItem;
let autoResolve: typeof import("@/lib/aiRuntime/attention/attentionEngine").autoResolve;
let resolveItem: typeof import("@/lib/aiRuntime/attention/attentionEngine").resolveItem;

const TENANT = "attention-tenant";
const runId = new mongoose.Types.ObjectId().toString();

describe("Attention Engine", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiAttentionItem.init();
    ({ createAttentionItem, autoResolve, resolveItem } = await import(
      "@/lib/aiRuntime/attention/attentionEngine"
    ));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiAttentionItem.deleteMany({});
  });

  it("creates a new item with status open", async () => {
    const id = await createAttentionItem({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      priority: "high",
      what: "Something needs review",
      why: "confidence too low",
      dedupeKey: "dedupe-1",
    });
    const item = await AiAttentionItem.findById(id).lean();
    expect(item!.status).toBe("open");
    expect(item!.priority).toBe("high");
  });

  it("dedupes repeat escalations of the same condition into one item", async () => {
    await createAttentionItem({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      priority: "high",
      what: "first pass",
      why: "reason A",
      dedupeKey: "dedupe-2",
    });
    await createAttentionItem({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      priority: "critical",
      what: "second pass — escalated further",
      why: "reason B",
      dedupeKey: "dedupe-2",
    });

    const count = await AiAttentionItem.countDocuments({ tenantId: TENANT, dedupeKey: "dedupe-2" });
    expect(count).toBe(1);

    const item = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: "dedupe-2" }).lean();
    expect(item!.priority).toBe("critical");
    expect(item!.what).toBe("second pass — escalated further");
  });

  it("autoResolve closes an open item as auto_resolved", async () => {
    await createAttentionItem({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      priority: "medium",
      what: "will clear itself",
      why: "condition present",
      dedupeKey: "dedupe-3",
    });

    await autoResolve(TENANT, "dedupe-3");

    const item = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: "dedupe-3" }).lean();
    expect(item!.status).toBe("auto_resolved");
    expect(item!.resolvedAt).not.toBeUndefined();
  });

  it("resolveItem closes an item as resolved (human-actioned)", async () => {
    await createAttentionItem({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      priority: "low",
      what: "human will handle",
      why: "needs judgement",
      dedupeKey: "dedupe-4",
    });

    await resolveItem(TENANT, "dedupe-4");

    const item = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: "dedupe-4" }).lean();
    expect(item!.status).toBe("resolved");
  });

  it("age is derivable from createdAt (no separate age field needed)", async () => {
    await createAttentionItem({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      priority: "low",
      what: "aging test",
      why: "x",
      dedupeKey: "dedupe-5",
    });
    const item = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: "dedupe-5" }).lean();
    expect(item!.createdAt).toBeInstanceOf(Date);
    const ageMs = Date.now() - new Date(item!.createdAt).getTime();
    expect(ageMs).toBeGreaterThanOrEqual(0);
  });
});
