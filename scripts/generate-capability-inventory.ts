/**
 * Regenerates the "honest not_implemented inventory" section of docs/ai/README.md from
 * lib/aiRuntime/capabilities/registry.ts — the single source of truth (Chunk 9, 0.2).
 *
 * Before this script existed, that section was hand-maintained prose that could (and did) drift
 * from the code: AI-06's own report claimed gaps AI-19/AI-27 had already closed while AI-06's
 * code still declared them open (docs/ai/OPEN_QUESTIONS.md #36). Generating the doc from the same
 * data the workflows themselves read (`getWorkflowGaps()`) makes that drift structurally
 * impossible — there is no second copy left to go stale.
 *
 * Usage: npx tsx scripts/generate-capability-inventory.ts
 * Writes docs/ai/README.md in place, replacing only the content between the
 * CAPABILITY_INVENTORY:START/END markers. Everything outside those markers is untouched.
 */
import fs from "fs";
import path from "path";
import { CAPABILITY_REGISTRY, type CapabilityDeclaration } from "../lib/aiRuntime/capabilities/registry";

const README_PATH = path.join(__dirname, "..", "docs", "ai", "README.md");
const START_MARKER = "<!-- CAPABILITY_INVENTORY:START -->";
const END_MARKER = "<!-- CAPABILITY_INVENTORY:END -->";

function statusLabel(c: CapabilityDeclaration): string {
  if (c.status === "implemented") return `implemented (by ${c.resolvedBy}, ${c.resolvedAt})`;
  if (c.status === "partial") return "partial";
  if (c.resolvedBy) return `not_implemented — deferred to ${c.resolvedBy}, not yet closed`;
  return "not_implemented";
}

function renderEntry(c: CapabilityDeclaration): string {
  const declaredBy = c.declaredBy.join(", ");
  const reason = /[.!?]$/.test(c.reason) ? c.reason : `${c.reason}.`;
  const blocker = c.blockingDependency ? ` Blocking dependency: ${c.blockingDependency}.` : " No blocker to name — permanent, by-design scope boundary.";
  return `**\`${c.capabilityId}\`** (declared by ${declaredBy}) — ${statusLabel(c)}. ${reason}${blocker}`;
}

function render(): string {
  const open = CAPABILITY_REGISTRY.filter((c) => c.status !== "implemented");
  const implemented = CAPABILITY_REGISTRY.filter((c) => c.status === "implemented");

  const lines: string[] = [];
  lines.push(
    "Generated from `lib/aiRuntime/capabilities/registry.ts` by `scripts/generate-capability-inventory.ts` " +
      "— do not hand-edit this block, it will be overwritten. Workflows read these same declarations via " +
      "`getWorkflowGaps(workflowId)`; nothing here is a second, independently-maintained copy.",
  );
  lines.push("");
  lines.push(`### Open (${open.length})`);
  lines.push("");
  for (const c of open) lines.push(`- ${renderEntry(c)}`);
  lines.push("");
  lines.push(`### Resolved (${implemented.length})`);
  lines.push("");
  if (implemented.length === 0) {
    lines.push("- None yet.");
  } else {
    for (const c of implemented) lines.push(`- ${renderEntry(c)}`);
  }
  return lines.join("\n");
}

function main(): void {
  const original = fs.readFileSync(README_PATH, "utf8");
  const startIdx = original.indexOf(START_MARKER);
  const endIdx = original.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`docs/ai/README.md is missing ${START_MARKER}/${END_MARKER} markers — cannot regenerate in place`);
  }
  const before = original.slice(0, startIdx + START_MARKER.length);
  const after = original.slice(endIdx);
  const updated = `${before}\n\n${render()}\n\n${after}`;
  fs.writeFileSync(README_PATH, updated);
  console.log(`docs/ai/README.md capability inventory regenerated: ${CAPABILITY_REGISTRY.length} declarations (${CAPABILITY_REGISTRY.filter((c) => c.status !== "implemented").length} open).`);
}

main();
