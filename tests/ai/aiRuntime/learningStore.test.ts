import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_learning";

import AiLearningRecord from "@/models/ai/AiLearningRecord";

let recordProposal: typeof import("@/lib/aiRuntime/learning/learningStore").recordProposal;
let recordOutcome: typeof import("@/lib/aiRuntime/learning/learningStore").recordOutcome;

const TENANT = "learning-tenant";
const runId = new mongoose.Types.ObjectId().toString();

describe("Learning loop outcome-capture store", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiLearningRecord.init();
    ({ recordProposal, recordOutcome } = await import("@/lib/aiRuntime/learning/learningStore"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiLearningRecord.deleteMany({});
  });

  it("records a proposal with outcome pending", async () => {
    const id = await recordProposal({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      proposal: { account: "Office Rent" },
    });
    const record = await AiLearningRecord.findById(id).lean();
    expect(record!.outcome).toBe("pending");
    expect(record!.proposal).toMatchObject({ account: "Office Rent" });
  });

  it("round-trips accepted/edited/rejected outcomes", async () => {
    const id = await recordProposal({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      proposal: { account: "Travel" },
    });

    await recordOutcome({
      learningRecordId: id,
      outcome: "edited",
      editedValue: { account: "Travel & Entertainment" },
      userId: new mongoose.Types.ObjectId().toString(),
      downstreamResult: "survived reconciliation",
    });

    const record = await AiLearningRecord.findById(id).lean();
    expect(record!.outcome).toBe("edited");
    expect(record!.editedValue).toMatchObject({ account: "Travel & Entertainment" });
    expect(record!.downstreamResult).toBe("survived reconciliation");
  });

  it("never mutates the original proposal when recording an outcome", async () => {
    const id = await recordProposal({
      tenantId: TENANT,
      workflowId: "AI-TEST",
      runId,
      proposal: { account: "Original" },
    });
    await recordOutcome({ learningRecordId: id, outcome: "rejected" });
    const record = await AiLearningRecord.findById(id).lean();
    expect(record!.proposal).toMatchObject({ account: "Original" });
    expect(record!.outcome).toBe("rejected");
  });
});
