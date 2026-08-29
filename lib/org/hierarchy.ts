/**
 * Pure helpers for the 8-level org hierarchy (6.8) — no DB, so they're
 * unit-tested in isolation. Cover: parent/child level validation, localization
 * inheritance, tree assembly, and subtree consolidation.
 */
import { ORG_LEVELS, type OrgLevel, type OrgLocalization } from "@/models/admin/OrgUnit";

export const LEVEL_INDEX: Record<OrgLevel, number> = ORG_LEVELS.reduce(
  (acc, l, i) => { acc[l] = i; return acc; },
  {} as Record<OrgLevel, number>,
);

/**
 * A child must sit strictly below its parent in the level order (levels may be
 * skipped — e.g. a Company can directly contain a Department — but never
 * inverted or equal).
 */
export function isValidChildLevel(parentLevel: OrgLevel | null, childLevel: OrgLevel): { ok: boolean; error?: string } {
  if (parentLevel == null) {
    // A root node should be the top level (Company) in the common case, but we
    // allow any level as a root so partial hierarchies can be modelled.
    return { ok: true };
  }
  if (LEVEL_INDEX[childLevel] <= LEVEL_INDEX[parentLevel]) {
    return { ok: false, error: `A ${childLevel} cannot be placed under a ${parentLevel} (must be a lower level).` };
  }
  return { ok: true };
}

export interface LocalizedNode { localization?: OrgLocalization }

/**
 * Effective localization for a node given its ancestors (root-first). Each field
 * resolves to the node's own value, else the NEAREST ancestor that sets it.
 */
export function resolveLocalization(node: LocalizedNode, ancestorsRootFirst: LocalizedNode[]): Required<OrgLocalization> {
  const chain = [...ancestorsRootFirst, node]; // nearest = last
  const pick = (key: keyof OrgLocalization): string => {
    for (let i = chain.length - 1; i >= 0; i--) {
      const v = chain[i]?.localization?.[key];
      if (v) return v;
    }
    return "";
  };
  return { currency: pick("currency"), language: pick("language"), timezone: pick("timezone"), taxRegime: pick("taxRegime") };
}

export interface TreeNode<T> { node: T; children: TreeNode<T>[] }

/** Assemble a flat list of {_id, parentId} nodes into a forest (roots first). */
export function buildTree<T extends { _id: any; parentId?: any }>(nodes: T[]): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>();
  for (const n of nodes) byId.set(String(n._id), { node: n, children: [] });
  const roots: TreeNode<T>[] = [];
  for (const n of nodes) {
    const self = byId.get(String(n._id))!;
    const pid = n.parentId ? String(n.parentId) : null;
    if (pid && byId.has(pid)) byId.get(pid)!.children.push(self);
    else roots.push(self);
  }
  return roots;
}

/**
 * Consolidate a numeric metric across a subtree. `metricFor(node)` returns the
 * node's own contribution; the result sums the node plus all descendants.
 * `descendantsByParent` maps a node id → its direct children (any depth handled
 * recursively). Pure — the caller supplies the already-loaded subtree.
 */
export function consolidateSubtree<T extends { _id: any }>(
  root: TreeNode<T>,
  metricFor: (node: T) => number,
): number {
  let total = metricFor(root.node);
  for (const child of root.children) total += consolidateSubtree(child, metricFor);
  return total;
}
