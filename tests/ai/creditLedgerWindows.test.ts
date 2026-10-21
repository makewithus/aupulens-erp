import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rate: { modelName: "test-model", inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 },
  expiredRows: [] as any[], ledger: null as any,
  failPeriod: "" as string,
  reserveCalls: [] as any[], balanceUpdates: [] as any[],
  ledgerCreateError: null as any,
}));
vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/models/platform/AiCostRate", () => ({ default: { findOne: () => ({ lean: async () => m.rate }) } }));
vi.mock("@/models/platform/AiCreditLedger", () => ({ default: {
  find: () => ({ lean: async () => m.expiredRows }),
  create: async (row: any) => { if (m.ledgerCreateError) throw m.ledgerCreateError; m.ledger = { ...row, _id: "ledger-1" }; return m.ledger; },
  findOne: (_filter: any) => ({ lean: async () => m.ledger?.status === "reserved" ? m.ledger : null }),
  updateOne: async (filter: any, update: any) => {
    if (m.ledger && filter._id === m.ledger._id && filter.status === "reserved") {
      Object.assign(m.ledger, update.$set);
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  },
  deleteOne: async () => { m.ledger = null; return { deletedCount: 1 }; },
} }));
vi.mock("@/models/platform/AiCreditBalance", () => ({ default: {
  updateOne: async (filter: any, update: any) => { m.balanceUpdates.push({ filter, update }); return { modifiedCount: 1 }; },
  findOneAndUpdate: async (filter: any, update: any) => {
    const period = filter.period;
    m.reserveCalls.push({ period, update });
    return period === m.failPeriod ? null : { period };
  },
  findOne: () => ({ lean: async () => null }),
} }));
vi.mock("@/lib/platform/entitlements/resolve", () => ({ resolveEntitlements: async () => ({ limits: {
  aiCreditsPerMonth: 200, aiCreditsPerSession: 20, aiCreditsPerWeek: 100,
} }) }));

import { reserveAiCredits, settleAiCredits } from "@/lib/platform/ai/credits";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_CREDIT_USD_VALUE", "0.01");
  vi.stubEnv("AI_BACKEND_CREDITS_PER_REQUEST", "0.25");
  vi.stubEnv("AI_TOOL_CALL_CREDITS", "0.1");
  m.expiredRows = [];
  m.ledger = null;
  m.failPeriod = "";
  m.ledgerCreateError = null;
  m.reserveCalls = [];
  m.balanceUpdates = [];
});

describe("plan credit reservation and settlement", () => {
  it("reserves weighted estimates across all plan buckets and reconciles to actual usage", async () => {
    const reserved = await reserveAiCredits({ tenantId: "acme", period: "202610", modelName: "test-model", feature: "analysis", requestId: "req-1", estimatedInputTokens: 1000, estimatedOutputTokens: 1000, estimatedToolCalls: 2, admittedAt: new Date("2026-10-19T13:00:00Z") });
    expect(reserved).toMatchObject({ allowed: true, requestId: "req-1", estimatedCredits: 1.45 });
    expect(m.reserveCalls.map((call) => call.period)).toEqual(["202610", "credit-session:1792404000000", "credit-week:1792368000000"].sort());
    expect(m.ledger?.bucketPeriods).toHaveLength(3);
    await settleAiCredits({ tenantId: "acme", period: "202610", requestId: "req-1", modelName: "test-model", feature: "analysis", inputTokens: 500, outputTokens: 500, success: true, toolCalls: 1 });
    const updatesAfterFirstSettlement = m.balanceUpdates.length;
    await settleAiCredits({ tenantId: "acme", period: "202610", requestId: "req-1", modelName: "test-model", feature: "analysis", inputTokens: 500, outputTokens: 500, success: true, toolCalls: 1 });
    expect(m.ledger).toMatchObject({ status: "charged", credits: 0.85, inputTokens: 500, outputTokens: 500, toolCalls: 1, backendCredits: 0.35 });
    expect(m.balanceUpdates).toHaveLength(updatesAfterFirstSettlement);
    expect(m.balanceUpdates.filter((item) => item.update.$inc?.used === 0.85)).toHaveLength(3);
    expect(m.balanceUpdates.filter((item) => item.update.$inc?.reserved === -1.45)).toHaveLength(3);
  });

  it("refunds every bucket on an infrastructure failure", async () => {
    const reserved = await reserveAiCredits({ tenantId: "acme", period: "202610", modelName: "test-model", feature: "chat", requestId: "req-fail", estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
    if (!reserved.allowed) throw new Error("reservation should be allowed");
    await settleAiCredits({ tenantId: "acme", period: "202610", requestId: "req-fail", modelName: "test-model", feature: "chat", inputTokens: 0, outputTokens: 0, success: false });
    expect(m.ledger?.status).toBe("refunded");
    expect(m.balanceUpdates.filter((item) => item.update.$inc?.reserved === -1.25)).toHaveLength(3);
    expect(m.balanceUpdates.some((item) => item.update.$inc?.used)).toBe(false);
  });

  it("rolls back earlier window reservations when a later window is exhausted", async () => {
    m.failPeriod = "credit-week:1792368000000";
    const result = await reserveAiCredits({ tenantId: "acme", period: "202610", modelName: "test-model", feature: "chat", requestId: "req-full", estimatedInputTokens: 1000, estimatedOutputTokens: 1000, admittedAt: new Date("2026-10-19T13:00:00Z") });
    expect(result).toMatchObject({ allowed: false, reason: "exhausted", window: "weekly" });
    expect(m.ledger).toBeNull();
    expect(m.balanceUpdates.filter((item) => item.update.$inc?.reserved === -1.25)).toHaveLength(2);
  });

  it("does not create another reservation for a duplicate idempotency key", async () => {
    m.ledgerCreateError = { code: 11000 };
    const result = await reserveAiCredits({ tenantId: "acme", period: "202610", modelName: "test-model", feature: "chat", requestId: "same", estimatedInputTokens: 10, estimatedOutputTokens: 10 });
    expect(result).toMatchObject({ allowed: false, reason: "duplicate" });
    expect(m.reserveCalls).toHaveLength(0);
  });
});
