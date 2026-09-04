import type { WorkflowPreview } from "@/lib/aiRuntime/runtime/executor";

/**
 * B.3: "The preview states the concrete effect — counts, amounts, records affected,
 * reversibility — derived from the workflow's proposed actions, not from the model's description
 * of them." Built purely from `WorkflowPreview.findings` (real `IAiFinding[]`, never text the
 * model invented) — counts and sums the amounts that are actually there.
 */
export function summarizePreview(workflowId: string, preview: WorkflowPreview): { summary: string; recordCount: number; totalAmount: number } {
  const recordCount = preview.findings.length;
  const totalAmount = Math.round(preview.findings.reduce((s, f) => s + (typeof f.amount === "number" ? f.amount : 0), 0) * 100) / 100;

  if (recordCount === 0) {
    return { summary: `${workflowId}: nothing to do right now.`, recordCount: 0, totalAmount: 0 };
  }
  const amountPart = totalAmount !== 0 ? ` totalling ₹${totalAmount}` : "";
  return { summary: `${workflowId} will act on ${recordCount} record(s)${amountPart} — confirm to proceed.`, recordCount, totalAmount };
}
