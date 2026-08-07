/**
 * Configurable multi-step approval chain (6.3).
 *
 * The routing decision — which steps of a policy apply to a given record, in
 * what order — is pure and unit-tested here. The DB-touching submit/approve
 * flow (processQuoteApproval / approveQuote) is integration-level and exercised
 * against real data separately.
 */
import { describe, it, expect, vi } from "vitest";

// approvalEngine imports several mongoose models at module load; mock the DB so
// the pure applicableSteps can be imported. (Models register schemas on import.)
vi.mock("@/lib/db", () => ({ default: vi.fn() }));

import { applicableSteps, getApprovalTier, type RecordMetrics } from "@/lib/crm/approvalEngine";
import type { IApprovalStep } from "@/models/crm/ApprovalPolicy";

const steps: IApprovalStep[] = [
  { order: 1, approverRole: "Manager", minAvgDiscountPercent: 5 },
  { order: 2, approverRole: "Finance", minAmount: 100000 },
  { order: 3, approverRole: "Executive", minAvgDiscountPercent: 20 },
];

describe("applicableSteps (multi-step chain routing)", () => {
  it("returns no steps when nothing crosses a threshold (auto-approve)", () => {
    const m: RecordMetrics = { avgDiscountPercent: 2, totalAmount: 5000 };
    expect(applicableSteps(m, steps)).toHaveLength(0);
  });

  it("routes to Manager only for a moderate discount, small amount", () => {
    const m: RecordMetrics = { avgDiscountPercent: 10, totalAmount: 5000 };
    const chain = applicableSteps(m, steps);
    expect(chain.map((s) => s.approverRole)).toEqual(["Manager"]);
  });

  it("builds a Manager → Finance → Executive chain for a big, deep-discount deal", () => {
    const m: RecordMetrics = { avgDiscountPercent: 25, totalAmount: 250000 };
    const chain = applicableSteps(m, steps);
    expect(chain.map((s) => s.approverRole)).toEqual(["Manager", "Finance", "Executive"]);
  });

  it("respects the amount gate independently of discount", () => {
    const m: RecordMetrics = { avgDiscountPercent: 0, totalAmount: 150000 };
    expect(applicableSteps(m, steps).map((s) => s.approverRole)).toEqual(["Finance"]);
  });

  it("sorts steps by order regardless of input order", () => {
    const unordered: IApprovalStep[] = [
      { order: 3, approverRole: "Executive" },
      { order: 1, approverRole: "Manager" },
      { order: 2, approverRole: "Finance" },
    ];
    const chain = applicableSteps({ avgDiscountPercent: 50, totalAmount: 1 }, unordered);
    expect(chain.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  it("keeps the legacy 3-tier helper intact for the no-policy fallback", () => {
    expect(getApprovalTier(3)).toBe("auto");
    expect(getApprovalTier(10)).toBe("manager");
    expect(getApprovalTier(30)).toBe("executive");
  });
});
