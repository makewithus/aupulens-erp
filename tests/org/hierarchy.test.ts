/**
 * 8-level org hierarchy pure helpers (6.8): level validation, localization
 * inheritance, tree assembly, subtree consolidation.
 */
import { describe, it, expect, vi } from "vitest";

// hierarchy.ts imports ORG_LEVELS from the OrgUnit model; mock the DB so the
// model file (which registers a mongoose schema) imports without a connection.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));

import { isValidChildLevel, resolveLocalization, buildTree, consolidateSubtree } from "@/lib/org/hierarchy";

describe("isValidChildLevel", () => {
  it("allows a strictly-lower child (adjacent or skipping levels)", () => {
    expect(isValidChildLevel("Company", "Region").ok).toBe(true);
    expect(isValidChildLevel("Company", "Department").ok).toBe(true); // skip allowed
    expect(isValidChildLevel(null, "Company").ok).toBe(true); // root
  });
  it("rejects an equal or inverted child level", () => {
    expect(isValidChildLevel("Branch", "Branch").ok).toBe(false);
    expect(isValidChildLevel("Department", "Company").ok).toBe(false);
  });
});

describe("resolveLocalization (inheritance)", () => {
  it("uses the node's own value when set", () => {
    const node = { localization: { currency: "USD" } };
    expect(resolveLocalization(node, []).currency).toBe("USD");
  });
  it("inherits from the nearest ancestor that sets a field", () => {
    const company = { localization: { currency: "INR", language: "en-IN", timezone: "Asia/Kolkata", taxRegime: "GST-IN" } };
    const region = { localization: { currency: "USD" } }; // overrides currency only
    const node = { localization: {} };
    const eff = resolveLocalization(node, [company, region]);
    expect(eff.currency).toBe("USD"); // nearest ancestor (region) wins
    expect(eff.language).toBe("en-IN"); // inherited from company
    expect(eff.taxRegime).toBe("GST-IN");
  });
  it("returns empty strings when nothing sets a field", () => {
    expect(resolveLocalization({ localization: {} }, [])).toEqual({ currency: "", language: "", timezone: "", taxRegime: "" });
  });
});

describe("buildTree", () => {
  it("assembles parent/child nodes into a forest", () => {
    const nodes = [
      { _id: "c", parentId: null, name: "Co" },
      { _id: "r", parentId: "c", name: "Region" },
      { _id: "b", parentId: "r", name: "Branch" },
      { _id: "b2", parentId: "r", name: "Branch2" },
    ];
    const roots = buildTree(nodes);
    expect(roots).toHaveLength(1);
    expect(roots[0].node.name).toBe("Co");
    expect(roots[0].children[0].node.name).toBe("Region");
    expect(roots[0].children[0].children.map((c) => c.node.name).sort()).toEqual(["Branch", "Branch2"]);
  });
  it("treats a node with a missing parent as a root", () => {
    expect(buildTree([{ _id: "x", parentId: "gone" }])).toHaveLength(1);
  });
});

describe("consolidateSubtree", () => {
  it("sums a metric across the whole subtree", () => {
    const tree = buildTree([
      { _id: "c", parentId: null, hc: 1 },
      { _id: "r", parentId: "c", hc: 2 },
      { _id: "b", parentId: "r", hc: 5 },
    ]);
    expect(consolidateSubtree(tree[0], (n: any) => n.hc)).toBe(8);
  });
});
