/**
 * Marketplace package sanitizing + install (6.12).
 *
 * The safety property that matters: a published payload carries only shareable
 * config (no tenant/user ids), and installing creates a tenant-owned record via
 * the same validation the builders use. The pure sanitizers are tested here; the
 * DB-writing install is covered live by scripts/verify-marketplace.ts.
 */
import { describe, it, expect, vi } from "vitest";

// packages.ts imports models + vocabulary; mock the DB so sanitizers import.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));

import { sanitizeWorkflow, sanitizeApprovalPolicy, sanitizePrintFormat, sanitizeForCategory } from "@/lib/marketplace/packages";

describe("sanitizeWorkflow", () => {
  it("keeps only shareable fields and drops tenant/user ids", () => {
    const clean = sanitizeWorkflow({
      _id: "x", tenantId: "acme", createdBy: "u1", enabled: true,
      name: "Deal follow-up", entity: "Opportunity", trigger: "stage_changed",
      conditions: [{ field: "stage", operator: "equals", value: "Negotiation" }],
      actions: [{ type: "create_task", payload: { title: "Call" } }],
    }) as any;
    expect(clean).toEqual({
      name: "Deal follow-up", entity: "Opportunity", trigger: "stage_changed",
      conditions: [{ field: "stage", operator: "equals", value: "Negotiation" }],
      actions: [{ type: "create_task", payload: { title: "Call" } }],
    });
    expect(clean.tenantId).toBeUndefined();
    expect(clean.createdBy).toBeUndefined();
  });

  it("coerces unknown trigger/entity and drops invalid actions", () => {
    const clean = sanitizeWorkflow({ name: "x", trigger: "bogus", entity: "Nope", conditions: [], actions: [{ type: "launch", payload: {} }, { type: "send_email", payload: {} }] }) as any;
    expect(clean.trigger).toBe("record_created");
    expect(clean.entity).toBe("Lead");
    expect(clean.actions).toEqual([{ type: "send_email", payload: {} }]);
  });

  it("returns null when no supported action survives", () => {
    expect(sanitizeWorkflow({ name: "x", actions: [{ type: "nope" }] })).toBeNull();
  });
});

describe("sanitizeApprovalPolicy", () => {
  it("keeps only step config, strips ids", () => {
    const clean = sanitizeApprovalPolicy({ _id: "p", tenantId: "acme", name: "Chain", entity: "Quote", steps: [{ order: 1, approverRole: "Manager", minAvgDiscountPercent: 5 }] }) as any;
    expect(clean.name).toBe("Chain");
    expect(clean.steps[0]).toEqual({ order: 1, approverRole: "Manager", minAvgDiscountPercent: 5, minAmount: undefined, label: undefined });
    expect(clean.tenantId).toBeUndefined();
  });
  it("returns null with no valid steps", () => {
    expect(sanitizeApprovalPolicy({ name: "x", steps: [{}] })).toBeNull();
  });
});

describe("sanitizePrintFormat", () => {
  it("extracts branding/display/layout only", () => {
    const clean = sanitizePrintFormat({ tenantId: "acme", branding: { accentColor: "#FF0000", pdfFooterText: "Thanks" }, display: { showStripedRows: true, hideHsn: false }, layout: { fontStyle: "Modern" } }) as any;
    expect(clean).toEqual({ branding: { accentColor: "#FF0000", pdfFooterText: "Thanks" }, display: { showStripedRows: true, hideHsn: false }, layout: { fontStyle: "Modern" } });
    expect((clean as any).tenantId).toBeUndefined();
  });
});

describe("sanitizeForCategory", () => {
  it("routes to the right sanitizer", () => {
    expect(sanitizeForCategory("workflow", { name: "x", actions: [{ type: "send_email", payload: {} }] })).not.toBeNull();
    expect(sanitizeForCategory("approval-policy", { steps: [{ approverRole: "Manager" }] })).not.toBeNull();
    expect(sanitizeForCategory("print-format", { branding: {} })).not.toBeNull();
    expect(sanitizeForCategory("workflow", { actions: [] })).toBeNull();
  });
});
