import connectDB from "@/lib/db";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

/**
 * Per-workflow kill switch (Hard Rule 6). A missing policy row means the
 * workflow has never been validated for this tenant — fails closed. This is
 * deliberately separate from `Organization.settings.ai.disabled` (the
 * pre-existing blunt tenant-wide AI toggle used by lib/ai/tenantAi.ts for
 * chat features, see docs/ai/GLOSSARY.md) — the two switches are unrelated
 * and both must allow a run for it to proceed above OBSERVE/RECOMMEND. This
 * module only checks the per-workflow one; the executor is responsible for
 * also respecting the tenant-wide switch wherever a workflow calls the LLM.
 */
export async function isWorkflowEnabled(tenantId: string, workflowId: string): Promise<boolean> {
  await connectDB();
  const policy = await AiWorkflowPolicy.findOne({ tenantId, workflowId }).lean();
  return policy?.killSwitchEnabled ?? false;
}
