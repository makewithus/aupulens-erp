/**
 * Step 1 — Organization schema extension tests.
 *
 * Uses Mongoose's in-memory document creation (new Model({})) to verify
 * schema defaults without a DB connection. No `.save()` is called.
 *
 * Verifies:
 * 1. ORGANIZATION_TIER constants are correct and complete.
 * 2. New orgs receive correct defaults for all Phase 2 fields.
 * 3. Existing org documents (without new fields) load without error
 *    and Mongoose applies schema defaults (migration-safety check).
 */

import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import {
  ORGANIZATION_TIER,
  ORGANIZATION_TIER_VALUES,
  ORGANIZATION_TIER_LABELS,
  type OrganizationTier,
} from "@/lib/constants/statuses";
import Organization from "@/models/Organization";

// ─── Tier constants ───────────────────────────────────────────────────────────

describe("ORGANIZATION_TIER constants", () => {
  it("contains exactly starter | professional | enterprise", () => {
    expect(Object.values(ORGANIZATION_TIER)).toEqual([
      "starter",
      "professional",
      "enterprise",
    ]);
  });

  it("ORGANIZATION_TIER_VALUES is a string array matching the object values", () => {
    expect(ORGANIZATION_TIER_VALUES).toEqual(["starter", "professional", "enterprise"]);
  });

  it("ORGANIZATION_TIER_LABELS has a human-readable label for every tier", () => {
    for (const tier of ORGANIZATION_TIER_VALUES) {
      expect(ORGANIZATION_TIER_LABELS[tier as OrganizationTier]).toBeTruthy();
    }
    expect(ORGANIZATION_TIER_LABELS[ORGANIZATION_TIER.STARTER]).toBe("Starter");
    expect(ORGANIZATION_TIER_LABELS[ORGANIZATION_TIER.PROFESSIONAL]).toBe("Professional");
    expect(ORGANIZATION_TIER_LABELS[ORGANIZATION_TIER.ENTERPRISE]).toBe("Enterprise");
  });
});

// ─── Schema defaults for new documents ───────────────────────────────────────

function makeMinimalOrg() {
  return new Organization({
    name: "Acme Corp",
    subdomain: "acme",
    ownerUserId: new mongoose.Types.ObjectId(),
  });
}

describe("Organization schema — Phase 2 field defaults (new documents)", () => {
  it("tier defaults to 'starter'", () => {
    const org = makeMinimalOrg();
    expect(org.tier).toBe(ORGANIZATION_TIER.STARTER);
  });

  it("maxUsers defaults to 5", () => {
    const org = makeMinimalOrg();
    expect(org.maxUsers).toBe(5);
  });

  it("aiCallsPerMonth defaults to 100", () => {
    const org = makeMinimalOrg();
    expect(org.aiCallsPerMonth).toBe(100);
  });

  it("settings.ai.model has no schema-level default (falls back to CLAUDE_DEFAULT_MODEL at call time)", () => {
    const org = makeMinimalOrg();
    expect(org.settings?.ai?.model).toBeUndefined();
  });

  it("settings.ai.maxTokensPerCall defaults to 1024", () => {
    const org = makeMinimalOrg();
    expect(org.settings?.ai?.maxTokensPerCall).toBe(1024);
  });

  it("settings.ai.disabled defaults to false", () => {
    const org = makeMinimalOrg();
    expect(org.settings?.ai?.disabled).toBe(false);
  });

  it("settings.branding fields are optional (undefined by default)", () => {
    const org = makeMinimalOrg();
    expect(org.settings?.branding?.emailFooter).toBeUndefined();
    expect(org.settings?.branding?.pdfHeader).toBeUndefined();
    expect(org.settings?.branding?.fontChoice).toBeUndefined();
  });

  it("pre-existing Phase 1 defaults still apply (themeColor, currency, timezone)", () => {
    const org = makeMinimalOrg();
    expect(org.settings?.themeColor).toBe("#3b82f6");
    expect(org.settings?.currency).toBe("USD");
    expect(org.settings?.timezone).toBe("UTC");
  });
});

// ─── Migration-safety: existing docs without new fields ──────────────────────

describe("Organization schema — migration safety (existing docs without new fields)", () => {
  it("loads without error when tier/maxUsers/aiCallsPerMonth are absent", () => {
    // Simulate a raw MongoDB document that was created before Phase 2
    const legacyRawDoc = {
      name: "Legacy Corp",
      subdomain: "legacy",
      ownerUserId: new mongoose.Types.ObjectId(),
      isActive: true,
      subscriptionStatus: "trial",
      settings: { themeColor: "#3b82f6", currency: "USD", timezone: "UTC" },
      // No tier, no maxUsers, no aiCallsPerMonth, no settings.ai, no settings.branding
    };

    // Mongoose applies schema defaults for missing fields on document creation
    const doc = new Organization(legacyRawDoc);
    expect(doc).toBeDefined();
    // Mongoose default kicks in: tier is 'starter' even though raw doc had none
    expect(doc.tier).toBe(ORGANIZATION_TIER.STARTER);
    expect(doc.maxUsers).toBe(5);
    expect(doc.aiCallsPerMonth).toBe(100);
  });

  it("preserves existing field values when new fields are absent from raw doc", () => {
    const legacyRawDoc = {
      name: "Old Corp",
      subdomain: "oldcorp",
      ownerUserId: new mongoose.Types.ObjectId(),
      subscriptionStatus: "active",
      settings: { themeColor: "#ff0000", currency: "INR" },
    };

    const doc = new Organization(legacyRawDoc);
    // Pre-existing field values are untouched
    expect(doc.settings?.themeColor).toBe("#ff0000");
    expect(doc.settings?.currency).toBe("INR");
    expect(doc.subscriptionStatus).toBe("active");
  });

  it("accepts explicit tier=professional override", () => {
    const doc = new Organization({
      name: "Pro Corp",
      subdomain: "procorp",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.PROFESSIONAL,
      maxUsers: 25,
      aiCallsPerMonth: 1000,
    });
    expect(doc.tier).toBe("professional");
    expect(doc.maxUsers).toBe(25);
    expect(doc.aiCallsPerMonth).toBe(1000);
  });

  it("rejects an invalid tier value via enum validation", () => {
    const doc = new Organization({
      name: "Bad Corp",
      subdomain: "badcorp",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: "invalid-tier",
    });
    // Mongoose enum validation errors are collected on validateSync
    const error = doc.validateSync();
    expect(error?.errors?.tier).toBeDefined();
  });
});
