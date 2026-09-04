import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_aipromotion";

import AiLearningRecord from "@/models/ai/AiLearningRecord";
import AiActionProposal from "@/models/ai/AiActionProposal";

let findStableClassificationPatterns: typeof import("@/lib/aiRuntime/learning/promotion").findStableClassificationPatterns;
let proposeStableRules: typeof import("@/lib/aiRuntime/learning/promotion").proposeStableRules;

const TENANT = "aipromotion-tenant";
const USER_ID = String(new mongoose.Types.ObjectId());
const ACCOUNT_ID = String(new mongoose.Types.ObjectId());

async function seedRecords(count: number, overrideCount: number) {
  for (let i = 0; i < count; i++) {
    await AiLearningRecord.create({
      tenantId: TENANT,
      workflowId: "AI-02",
      runId: new mongoose.Types.ObjectId(),
      proposal: { accountId: ACCOUNT_ID, accountName: "", basis: "history", alternatives: [] },
      outcome: i < overrideCount ? "edited" : "accepted",
    });
  }
}

describe("AI learning-loop promotion (governed, proposal-only)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([AiLearningRecord.init(), AiActionProposal.init()]);
    ({ findStableClassificationPatterns, proposeStableRules } = await import("@/lib/aiRuntime/learning/promotion"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([AiLearningRecord.deleteMany({}), AiActionProposal.deleteMany({})]);
  });

  it("a stable pattern (>=10 observations, <=10% override) is found; an unstable one is not (synthetic AiLearningRecord data — proves the aggregator, not real AI-02 traffic, since AI-02 doesn't call record_learning_outcome yet)", async () => {
    await seedRecords(10, 0); // 0% override — stable
    const patterns = await findStableClassificationPatterns(TENANT);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].accountId).toBe(ACCOUNT_ID);
    expect(patterns[0].observations).toBe(10);
    expect(patterns[0].overrideRate).toBe(0);
  });

  it("an unstable pattern (override rate above the floor) is never proposed", async () => {
    await seedRecords(10, 5); // 50% override — unstable
    const patterns = await findStableClassificationPatterns(TENANT);
    expect(patterns).toHaveLength(0);
  });

  it("a pattern below the minimum sample size is never proposed, even with zero overrides", async () => {
    await seedRecords(3, 0);
    const patterns = await findStableClassificationPatterns(TENANT);
    expect(patterns).toHaveLength(0);
  });

  it("a stable pattern generates exactly one proposed AiActionProposal (create_banking_rule); running again does not duplicate it", async () => {
    await seedRecords(10, 0);
    const first = await proposeStableRules(TENANT, USER_ID);
    expect(first.proposed).toBe(1);

    const second = await proposeStableRules(TENANT, USER_ID);
    expect(second.proposed).toBe(0); // already proposed, still "proposed" status — no duplicate

    const proposals = await AiActionProposal.find({ tenantId: TENANT, actionType: "create_banking_rule" }).lean();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe("proposed"); // never auto-confirmed — a human must act
    expect((proposals[0].params as { evidence: { observations: number } }).evidence.observations).toBe(10);
  });

  it("promotion never writes a BankingRule, tax rate, accounting policy, or account mapping directly (source-grep)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/learning/promotion.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const forbiddenWrites = output
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => !/AiActionProposal/.test(line));
    expect(forbiddenWrites).toEqual([]);
  });
});
