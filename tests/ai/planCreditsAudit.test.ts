import { describe, expect, it, vi, beforeEach } from "vitest";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { PLAN_KEY, PLAN_KEY_LABELS } from "@/lib/constants/statuses";
import { getAiCreditWindows } from "@/lib/platform/ai/creditWindows";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import { estimateAiCredits, reserveAiCredits, settleAiCredits, getAiCreditBalance } from "@/lib/platform/ai/credits";

// Hoisted mocks for database layer
const dbMock = vi.hoisted(() => ({
  rate: { modelName: "gpt-4o", inputCostPerMillionTokens: 2.5, outputCostPerMillionTokens: 10 },
  ledger: null as any,
  ledgerRows: [] as any[],
  balances: new Map<string, { used: number; reserved: number; limit: number }>(),
  failPeriod: "" as string,
  ledgerCreateError: null as any,
  orgDoc: null as any,
  entitlementDoc: null as any,
  planDocs: new Map<string, any>(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));

vi.mock("@/models/platform/AiCostRate", () => ({
  default: {
    findOne: (filter: any) => ({
      lean: async () => (filter.modelName === dbMock.rate.modelName ? dbMock.rate : null),
    }),
  },
}));

vi.mock("@/models/platform/AiCreditLedger", () => ({
  default: {
    create: async (row: any) => {
      if (dbMock.ledgerCreateError) throw dbMock.ledgerCreateError;
      dbMock.ledger = { ...row, _id: "ledger-" + Math.random().toString(36).slice(2) };
      dbMock.ledgerRows.push(dbMock.ledger);
      return dbMock.ledger;
    },
    findOne: (filter: any) => ({
      lean: async () => {
        if (filter.requestId) {
          const match = dbMock.ledgerRows.find((r) => r.requestId === filter.requestId && (!filter.status || r.status === filter.status));
          return match ?? null;
        }
        return dbMock.ledger?.status === filter.status ? dbMock.ledger : null;
      },
    }),
    updateOne: async (filter: any, update: any) => {
      const target = dbMock.ledgerRows.find((r) => {
        if (filter._id && r._id !== filter._id) return false;
        if (filter.requestId && r.requestId !== filter.requestId) return false;
        if (filter.status && r.status !== filter.status) return false;
        return true;
      });
      if (target) {
        Object.assign(target, update.$set);
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    },
    deleteOne: async (filter: any) => {
      const idx = dbMock.ledgerRows.findIndex((r) => {
        if (filter._id && r._id !== filter._id) return false;
        if (filter.requestId && r.requestId !== filter.requestId) return false;
        return true;
      });
      if (idx !== -1) {
        dbMock.ledgerRows.splice(idx, 1);
        if (dbMock.ledger?._id === filter._id || dbMock.ledger?.requestId === filter.requestId) {
          dbMock.ledger = null;
        }
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },
    find: () => ({ lean: async () => [] }),
  },
}));

vi.mock("@/models/platform/AiCreditBalance", () => ({
  default: {
    findOneAndUpdate: async (filter: any, update: any) => {
      const key = `${filter.tenantId}:${filter.period}`;
      if (filter.period === dbMock.failPeriod) return null;
      const cur = dbMock.balances.get(key) ?? { used: 0, reserved: 0, limit: 1000 };
      const incReserved = update.$inc?.reserved ?? 0;
      const incUsed = update.$inc?.used ?? 0;
      const nextReserved = cur.reserved + incReserved;
      const nextUsed = cur.used + incUsed;
      dbMock.balances.set(key, { ...cur, reserved: nextReserved, used: nextUsed });
      return { ...cur, reserved: nextReserved, used: nextUsed };
    },
    updateOne: async (filter: any, update: any) => {
      const key = `${filter.tenantId}:${filter.period}`;
      const cur = dbMock.balances.get(key) ?? { used: 0, reserved: 0, limit: 1000 };
      const incReserved = update.$inc?.reserved ?? 0;
      const incUsed = update.$inc?.used ?? 0;
      dbMock.balances.set(key, { ...cur, reserved: cur.reserved + incReserved, used: cur.used + incUsed });
      return { modifiedCount: 1 };
    },
    findOne: (filter: any) => ({
      lean: async () => {
        const key = `${filter.tenantId}:${filter.period}`;
        return dbMock.balances.get(key) ?? null;
      },
    }),
  },
}));

vi.mock("@/models/admin/Organization", () => ({
  default: {
    findOne: () => ({
      lean: async () => dbMock.orgDoc,
    }),
  },
}));

vi.mock("@/models/platform/OrganizationEntitlement", () => ({
  default: {
    findOne: () => ({
      lean: async () => dbMock.entitlementDoc,
    }),
  },
}));

vi.mock("@/models/platform/Plan", () => ({
  default: {
    findOne: (filter: any) => ({
      lean: async () => dbMock.planDocs.get(filter.key) ?? null,
    }),
  },
}));

describe("Aupulens ERP AI Credit System Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AI_CREDIT_USD_VALUE", "0.01");
    vi.stubEnv("AI_BACKEND_CREDITS_PER_REQUEST", "0.25");
    vi.stubEnv("AI_TOOL_CALL_CREDITS", "0.1");
    dbMock.balances.clear();
    dbMock.ledgerRows = [];
    dbMock.ledger = null;
    dbMock.failPeriod = "";
    dbMock.ledgerCreateError = null;
    dbMock.orgDoc = null;
    dbMock.entitlementDoc = null;
    dbMock.planDocs.clear();
  });

  describe("1. Plan Limits as Single Source of Truth", () => {
    it("defines authoritative session and weekly limits for Free / Trial, Pro, and Business", () => {
      // Free / Trial
      const freeFeatures = PLAN_DEFINITIONS[PLAN_KEY.FREE].features;
      expect(freeFeatures.aiCreditsPerSession).toBe(20);
      expect(freeFeatures.aiCreditsPerWeek).toBe(100);
      expect(freeFeatures.aiCreditsPerMonth).toBe(500);
      expect(PLAN_KEY_LABELS[PLAN_KEY.FREE]).toBe("Free / Trial");

      // Pro
      const proFeatures = PLAN_DEFINITIONS[PLAN_KEY.PRO].features;
      expect(proFeatures.aiCreditsPerSession).toBe(100);
      expect(proFeatures.aiCreditsPerWeek).toBe(500);
      expect(proFeatures.aiCreditsPerMonth).toBe(2500);

      // Business
      const bizFeatures = PLAN_DEFINITIONS[PLAN_KEY.BUSINESS].features;
      expect(bizFeatures.aiCreditsPerSession).toBe(250);
      expect(bizFeatures.aiCreditsPerWeek).toBe(1500);
      expect(bizFeatures.aiCreditsPerMonth).toBe(6000);
    });

    it("resolves trial or unassigned organization accounts to Free / Trial plan limits", async () => {
      dbMock.orgDoc = { subdomain: "trial-org", subscriptionStatus: "trial" };
      const resolved = await resolveEntitlements("trial-org");
      expect(resolved.planKey).toBe(PLAN_KEY.FREE);
      expect(resolved.limits.aiCreditsPerSession).toBe(20);
      expect(resolved.limits.aiCreditsPerWeek).toBe(100);
    });

    it("resolves active Pro subscriptions to Pro limits", async () => {
      dbMock.orgDoc = { subdomain: "pro-org", subscriptionStatus: "active" };
      dbMock.entitlementDoc = { tenantId: "pro-org", planKey: "pro", active: true };
      const resolved = await resolveEntitlements("pro-org");
      expect(resolved.planKey).toBe("pro");
      expect(resolved.limits.aiCreditsPerSession).toBe(100);
      expect(resolved.limits.aiCreditsPerWeek).toBe(500);
    });

    it("applies enterprise custom limit overrides when configured in entitlement", async () => {
      dbMock.orgDoc = { subdomain: "enterprise-org", subscriptionStatus: "active" };
      dbMock.entitlementDoc = {
        tenantId: "enterprise-org",
        planKey: "enterprise",
        active: true,
        customLimits: {
          aiCreditsPerSession: 500,
          aiCreditsPerWeek: 3000,
          aiCreditsPerMonth: 12000,
        },
      };
      const resolved = await resolveEntitlements("enterprise-org");
      expect(resolved.limits.aiCreditsPerSession).toBe(500);
      expect(resolved.limits.aiCreditsPerWeek).toBe(3000);
      expect(resolved.limits.aiCreditsPerMonth).toBe(12000);
    });
  });

  describe("2. Task-Based Credit Calculation", () => {
    it("calculates lower credits for small chat queries and higher credits for large context tasks", async () => {
      const small = await estimateAiCredits({
        modelName: "gpt-4o",
        estimatedInputTokens: 200,
        estimatedOutputTokens: 150,
      });
      const large = await estimateAiCredits({
        modelName: "gpt-4o",
        estimatedInputTokens: 4000,
        estimatedOutputTokens: 2000,
      });

      // Small: (200*2.5 + 150*10)/1M = $0.002. Credits = $0.002 / $0.01 = 0.2 + 0.25 backend = 0.45 credits
      expect(small.credits).toBe(0.45);
      // Large: (4000*2.5 + 2000*10)/1M = $0.03. Credits = $0.03 / $0.01 = 3.0 + 0.25 backend = 3.25 credits
      expect(large.credits).toBe(3.25);
      expect(large.credits).toBeGreaterThan(small.credits);
    });

    it("charges additional credits for tool calls only when they occur", async () => {
      const noTools = await estimateAiCredits({
        modelName: "gpt-4o",
        estimatedInputTokens: 500,
        estimatedOutputTokens: 500,
        estimatedToolCalls: 0,
      });
      const withTools = await estimateAiCredits({
        modelName: "gpt-4o",
        estimatedInputTokens: 500,
        estimatedOutputTokens: 500,
        estimatedToolCalls: 3,
      });
      expect(withTools.credits - noTools.credits).toBeCloseTo(0.3, 4);
    });

    it("falls back to estimate gracefully when provider tokens are missing and flags isEstimated: true", async () => {
      dbMock.orgDoc = { subdomain: "acme", subscriptionStatus: "active" };
      dbMock.entitlementDoc = { tenantId: "acme", planKey: "free", active: true };

      const reservation = await reserveAiCredits({
        tenantId: "acme",
        period: "202610",
        modelName: "gpt-4o",
        feature: "chat",
        requestId: "req-missing-tokens",
        estimatedInputTokens: 300,
        estimatedOutputTokens: 200,
        userId: "user-1",
      });
      expect(reservation.allowed).toBe(true);

      // Settle with undefined inputTokens/outputTokens (missing metadata)
      await settleAiCredits({
        tenantId: "acme",
        period: "202610",
        requestId: "req-missing-tokens",
        modelName: "gpt-4o",
        feature: "chat",
        inputTokens: undefined as any,
        outputTokens: undefined as any,
        success: true,
      });

      const settledLedger = dbMock.ledgerRows.find((r) => r.requestId === "req-missing-tokens");
      expect(settledLedger?.status).toBe("charged");
      expect(settledLedger?.isEstimated).toBe(true);
      expect(settledLedger?.completedAt).toBeInstanceOf(Date);
      expect(settledLedger?.userId).toBe("user-1");
      expect(settledLedger?.credits).toBeGreaterThan(0);
    });
  });

  describe("3. Window Reset Mechanics (5-Hour Session & 7-Day Week)", () => {
    it("partitions into exact 5-hour session windows and 7-day Monday-to-Monday weekly windows", () => {
      // 13:42 UTC should be in the 10:00 to 15:00 session window
      const date = new Date("2026-10-19T13:42:00.000Z");
      const windows = getAiCreditWindows(date, { aiCreditsPerSession: 20, aiCreditsPerWeek: 100 });

      const session = windows.find((w) => w.kind === "session")!;
      expect(session.start.toISOString()).toBe("2026-10-19T10:00:00.000Z");
      expect(session.end.toISOString()).toBe("2026-10-19T15:00:00.000Z");
      expect(session.limit).toBe(20);

      const weekly = windows.find((w) => w.kind === "weekly")!;
      expect(weekly.start.toISOString()).toBe("2026-10-19T00:00:00.000Z");
      expect(weekly.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
      expect(weekly.limit).toBe(100);
    });

    it("advances session bucket period at 5-hour boundary while preserving weekly bucket", () => {
      const beforeExpiry = new Date("2026-10-19T14:59:59.000Z");
      const afterExpiry = new Date("2026-10-19T15:00:01.000Z");

      const wBefore = getAiCreditWindows(beforeExpiry, { aiCreditsPerSession: 20, aiCreditsPerWeek: 100 });
      const wAfter = getAiCreditWindows(afterExpiry, { aiCreditsPerSession: 20, aiCreditsPerWeek: 100 });

      const sessionBefore = wBefore.find((w) => w.kind === "session")!;
      const sessionAfter = wAfter.find((w) => w.kind === "session")!;

      expect(sessionBefore.end.toISOString()).toBe("2026-10-19T15:00:00.000Z");
      expect(sessionAfter.start.toISOString()).toBe("2026-10-19T15:00:00.000Z");
      expect(sessionAfter.end.toISOString()).toBe("2026-10-19T20:00:00.000Z");

      // Weekly window is IDENTICAL across the 5h session reset
      const weekBefore = wBefore.find((w) => w.kind === "weekly")!;
      const weekAfter = wAfter.find((w) => w.kind === "weekly")!;
      expect(weekBefore.start.toISOString()).toBe(weekAfter.start.toISOString());
      expect(weekBefore.end.toISOString()).toBe(weekAfter.end.toISOString());
    });
  });

  describe("4. Concurrency, Failures, and Idempotency", () => {
    it("deduplicates requests with the same idempotency key and rejects duplicate processing", async () => {
      dbMock.ledgerCreateError = { code: 11000 };
      const res = await reserveAiCredits({
        tenantId: "acme",
        period: "202610",
        modelName: "gpt-4o",
        feature: "chat",
        requestId: "duplicate-key-1",
        estimatedInputTokens: 100,
        estimatedOutputTokens: 100,
      });
      expect(res).toMatchObject({ allowed: false, reason: "duplicate" });
    });

    it("refunds reservations on provider failure without incrementing used credits", async () => {
      dbMock.orgDoc = { subdomain: "acme", subscriptionStatus: "active" };
      dbMock.entitlementDoc = { tenantId: "acme", planKey: "pro", active: true };

      const reservation = await reserveAiCredits({
        tenantId: "acme",
        period: "202610",
        modelName: "gpt-4o",
        feature: "chat",
        requestId: "failed-request-1",
        estimatedInputTokens: 500,
        estimatedOutputTokens: 500,
      });
      expect(reservation.allowed).toBe(true);

      // Simulate provider failure
      await settleAiCredits({
        tenantId: "acme",
        period: "202610",
        requestId: "failed-request-1",
        modelName: "gpt-4o",
        feature: "chat",
        inputTokens: 0,
        outputTokens: 0,
        success: false,
      });

      const ledger = dbMock.ledgerRows.find((r) => r.requestId === "failed-request-1");
      expect(ledger?.status).toBe("refunded");
      expect(ledger?.credits).toBe(0);
      expect(ledger?.completedAt).toBeInstanceOf(Date);
    });

    it("atomically rolls back earlier reserved windows if a subsequent window is exhausted", async () => {
      dbMock.orgDoc = { subdomain: "acme", subscriptionStatus: "active" };
      dbMock.entitlementDoc = { tenantId: "acme", planKey: "pro", active: true };

      // Make weekly window fail
      const windows = getAiCreditWindows(new Date("2026-10-19T13:00:00Z"), { aiCreditsPerSession: 100, aiCreditsPerWeek: 500 });
      const weeklyWindow = windows.find((w) => w.kind === "weekly")!;
      dbMock.failPeriod = `credit-week:${weeklyWindow.start.getTime()}`;

      const res = await reserveAiCredits({
        tenantId: "acme",
        period: "202610",
        modelName: "gpt-4o",
        feature: "chat",
        requestId: "roll-back-req",
        estimatedInputTokens: 100,
        estimatedOutputTokens: 100,
        admittedAt: new Date("2026-10-19T13:00:00Z"),
      });

      expect(res.allowed).toBe(false);
      expect((res as any).reason).toBe("exhausted");
      expect((res as any).window).toBe("weekly");
      expect(dbMock.ledgerRows.find((r) => r.requestId === "roll-back-req")).toBeUndefined();
    });
  });

  describe("5. Authoritative Credit Balance & UI Clamping", () => {
    it("reports remaining credits as Math.max(0, limit - used - reserved) and provides earliest window reset", async () => {
      dbMock.orgDoc = { subdomain: "acme", subscriptionStatus: "active" };
      dbMock.entitlementDoc = { tenantId: "acme", planKey: "free", active: true };

      const balance = await getAiCreditBalance("acme", "202610", new Date("2026-10-19T13:00:00Z"));
      expect(balance.windows.session.limit).toBe(20);
      expect(balance.windows.weekly.limit).toBe(100);
      expect(balance.resetsAt).toBe(balance.windows.session.resetsAt);
      expect(balance.remaining).toBe(balance.limit);
      expect(balance.planKey).toBe(PLAN_KEY.FREE);
    });
  });
});
