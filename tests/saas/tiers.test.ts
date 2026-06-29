/**
 * Step 4 — Tier limits + SubscriptionEvent schema tests.
 *
 * Pure unit tests — no mocks needed (no DB, no network).
 */

import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import {
  TIER_LIMITS,
  getTierLimits,
  type TierLimits,
} from "@/lib/constants/tiers";
import {
  ORGANIZATION_TIER,
  ORGANIZATION_TIER_VALUES,
  SUBSCRIPTION_EVENT_TYPE,
  SUBSCRIPTION_EVENT_TYPE_VALUES,
} from "@/lib/constants/statuses";
import SubscriptionEvent from "@/models/SubscriptionEvent";

// ─── getTierLimits ────────────────────────────────────────────────────────────

describe("TIER_LIMITS — coverage", () => {
  it("TIER_LIMITS has an entry for every ORGANIZATION_TIER value", () => {
    for (const tier of ORGANIZATION_TIER_VALUES) {
      expect(TIER_LIMITS).toHaveProperty(tier);
    }
  });

  it("no tier has empty enabledModules", () => {
    for (const tier of ORGANIZATION_TIER_VALUES) {
      expect(TIER_LIMITS[tier].enabledModules.length).toBeGreaterThan(0);
    }
  });
});

describe("getTierLimits — starter", () => {
  it("returns maxUsers=5", () => {
    expect(getTierLimits(ORGANIZATION_TIER.STARTER).maxUsers).toBe(5);
  });
  it("returns aiCallsPerMonth=100", () => {
    expect(getTierLimits(ORGANIZATION_TIER.STARTER).aiCallsPerMonth).toBe(100);
  });
  it("enabledModules includes admin, hr, inventory", () => {
    const { enabledModules } = getTierLimits(ORGANIZATION_TIER.STARTER);
    expect(enabledModules).toContain("admin");
    expect(enabledModules).toContain("hr");
    expect(enabledModules).toContain("inventory");
  });
  it("starter does NOT include manufacturing (professional+ feature)", () => {
    const { enabledModules } = getTierLimits(ORGANIZATION_TIER.STARTER);
    expect(enabledModules).not.toContain("manufacturing");
  });
});

describe("getTierLimits — professional", () => {
  it("returns maxUsers=25", () => {
    expect(getTierLimits(ORGANIZATION_TIER.PROFESSIONAL).maxUsers).toBe(25);
  });
  it("returns aiCallsPerMonth=1000", () => {
    expect(getTierLimits(ORGANIZATION_TIER.PROFESSIONAL).aiCallsPerMonth).toBe(1000);
  });
  it("enabledModules includes finance, sales, crm", () => {
    const { enabledModules } = getTierLimits(ORGANIZATION_TIER.PROFESSIONAL);
    expect(enabledModules).toContain("finance");
    expect(enabledModules).toContain("sales");
    expect(enabledModules).toContain("crm");
  });
});

describe("getTierLimits — enterprise", () => {
  it("returns maxUsers=100", () => {
    expect(getTierLimits(ORGANIZATION_TIER.ENTERPRISE).maxUsers).toBe(100);
  });
  it("returns aiCallsPerMonth=10000", () => {
    expect(getTierLimits(ORGANIZATION_TIER.ENTERPRISE).aiCallsPerMonth).toBe(10_000);
  });
  it("enabledModules includes manufacturing (enterprise-only module)", () => {
    const { enabledModules } = getTierLimits(ORGANIZATION_TIER.ENTERPRISE);
    expect(enabledModules).toContain("manufacturing");
  });
});

describe("getTierLimits — limits are strictly increasing starter < professional < enterprise", () => {
  it("maxUsers: starter < professional < enterprise", () => {
    const s = getTierLimits(ORGANIZATION_TIER.STARTER).maxUsers;
    const p = getTierLimits(ORGANIZATION_TIER.PROFESSIONAL).maxUsers;
    const e = getTierLimits(ORGANIZATION_TIER.ENTERPRISE).maxUsers;
    expect(s).toBeLessThan(p);
    expect(p).toBeLessThan(e);
  });

  it("aiCallsPerMonth: starter < professional < enterprise", () => {
    const s = getTierLimits(ORGANIZATION_TIER.STARTER).aiCallsPerMonth;
    const p = getTierLimits(ORGANIZATION_TIER.PROFESSIONAL).aiCallsPerMonth;
    const e = getTierLimits(ORGANIZATION_TIER.ENTERPRISE).aiCallsPerMonth;
    expect(s).toBeLessThan(p);
    expect(p).toBeLessThan(e);
  });
});

describe("getTierLimits — unknown / invalid tier falls back to starter", () => {
  it("undefined falls back to starter", () => {
    expect(getTierLimits(undefined).maxUsers).toBe(5);
  });
  it("null falls back to starter", () => {
    expect(getTierLimits(null).maxUsers).toBe(5);
  });
  it("unknown string falls back to starter", () => {
    expect(getTierLimits("ultra" as any).maxUsers).toBe(5);
  });
});

// ─── SUBSCRIPTION_EVENT_TYPE constants ────────────────────────────────────────

describe("SUBSCRIPTION_EVENT_TYPE constants", () => {
  it("contains the required event types", () => {
    expect(SUBSCRIPTION_EVENT_TYPE_VALUES).toEqual(
      expect.arrayContaining([
        "created",
        "upgraded",
        "downgraded",
        "renewed",
        "payment_succeeded",
        "payment_failed",
        "canceled",
      ])
    );
  });

  it("SUBSCRIPTION_EVENT_TYPE_VALUES length matches SUBSCRIPTION_EVENT_TYPE keys", () => {
    expect(SUBSCRIPTION_EVENT_TYPE_VALUES.length).toBe(
      Object.keys(SUBSCRIPTION_EVENT_TYPE).length
    );
  });
});

// ─── SubscriptionEvent schema ─────────────────────────────────────────────────

function makeMinimalEvent(overrides: object = {}) {
  return new SubscriptionEvent({
    tenantId: "acme",
    type: SUBSCRIPTION_EVENT_TYPE.CREATED,
    tier: ORGANIZATION_TIER.STARTER,
    ...overrides,
  });
}

describe("SubscriptionEvent schema — valid documents", () => {
  it("creates a valid event without error", () => {
    const ev = makeMinimalEvent();
    expect(ev.validateSync()).toBeUndefined();
  });

  it("amount defaults to 0", () => {
    expect(makeMinimalEvent().amount).toBe(0);
  });

  it("currency defaults to USD", () => {
    expect(makeMinimalEvent().currency).toBe("USD");
  });

  it("occurredAt defaults to now (within 5 seconds)", () => {
    const ev = makeMinimalEvent();
    expect(Date.now() - ev.occurredAt.getTime()).toBeLessThan(5000);
  });

  it("externalEventId is optional (no validation error when absent)", () => {
    const ev = makeMinimalEvent();
    expect(ev.externalEventId).toBeUndefined();
    expect(ev.validateSync()).toBeUndefined();
  });
});

describe("SubscriptionEvent schema — enum validation", () => {
  it("rejects an invalid event type", () => {
    const ev = makeMinimalEvent({ type: "refunded" });
    expect(ev.validateSync()?.errors?.type).toBeDefined();
  });

  it("rejects an invalid tier", () => {
    const ev = makeMinimalEvent({ tier: "premium" });
    expect(ev.validateSync()?.errors?.tier).toBeDefined();
  });

  it("accepts all valid event types without error", () => {
    for (const type of SUBSCRIPTION_EVENT_TYPE_VALUES) {
      const ev = makeMinimalEvent({ type });
      expect(ev.validateSync()).toBeUndefined();
    }
  });
});

describe("SubscriptionEvent schema — required fields", () => {
  it("requires tenantId", () => {
    const ev = new SubscriptionEvent({
      type: SUBSCRIPTION_EVENT_TYPE.CREATED,
      tier: ORGANIZATION_TIER.STARTER,
    });
    expect(ev.validateSync()?.errors?.tenantId).toBeDefined();
  });

  it("requires type", () => {
    const ev = new SubscriptionEvent({ tenantId: "acme", tier: ORGANIZATION_TIER.STARTER });
    expect(ev.validateSync()?.errors?.type).toBeDefined();
  });

  it("requires tier", () => {
    const ev = new SubscriptionEvent({ tenantId: "acme", type: SUBSCRIPTION_EVENT_TYPE.CREATED });
    expect(ev.validateSync()?.errors?.tier).toBeDefined();
  });
});
