/**
 * The single, structurally-enforced way every `dedupeKey` in this system is built (Chunk 10a
 * addendum, Part 3 — docs/ai/BRIEF-10a-ADDENDUM.md). Before this, every call site hand-rolled its
 * own template-string key with its own prefix/separator convention (`ai29-design-concern-${id}`,
 * `ai05-worklist:${a}:${b}`, `${workflow.id}:${finding.id}`, ...) — a convention, not a guarantee.
 * That is exactly how the already-fixed AI-29/AI-05 duplicate-attention-item bug happened: two
 * different call sites building the same logical key inconsistently, so both fired and produced
 * two rows for one exception. Removing the redundant call sites fixed those two instances; routing
 * every remaining dedupeKey through this one function closes off the *pattern* itself, so a new
 * call site cannot independently reintroduce it — there is nowhere else to build one.
 */
export function buildDedupeKey(...parts: (string | number)[]): string {
  return parts.map(String).join(":");
}
