import connectDB from "@/lib/db";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import { AI_ATTENTION_STATUS, type AiAttentionPriority } from "@/lib/constants/statuses";

/**
 * The Attention Engine (Part 2.7) — the users' actual inbox. Every escalation
 * from every workflow lands here via `createAttentionItem()`. Items dedupe
 * on `dedupeKey` (an upsert, not a plain insert — calling this twice for the
 * same underlying condition updates one row, never spams two), age via
 * `createdAt`, and close via `autoResolve()` once the underlying condition
 * is confirmed cleared (called by the workflow that raised it, on a later run
 * that finds the condition gone — not by this engine guessing).
 */

export interface CreateAttentionItemParams {
  tenantId: string;
  workflowId: string;
  runId: string;
  priority: AiAttentionPriority;
  what: string;
  why: string;
  evidence?: { kind: string; ref: string; label: string }[];
  proposedAction?: string;
  impactAmount?: number;
  owner?: string;
  due?: Date;
  oneClickActions?: { label: string; tool: string; args: Record<string, unknown> }[];
  dedupeKey: string;
}

export async function createAttentionItem(params: CreateAttentionItemParams): Promise<string> {
  await connectDB();
  const doc = await AiAttentionItem.findOneAndUpdate(
    { tenantId: params.tenantId, dedupeKey: params.dedupeKey },
    {
      $set: {
        workflowId: params.workflowId,
        runId: params.runId,
        priority: params.priority,
        what: params.what,
        why: params.why,
        evidence: params.evidence ?? [],
        proposedAction: params.proposedAction,
        impactAmount: params.impactAmount,
        owner: params.owner,
        due: params.due,
        oneClickActions: params.oneClickActions ?? [],
        status: AI_ATTENTION_STATUS.OPEN,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return String(doc._id);
}

export async function autoResolve(tenantId: string, dedupeKey: string): Promise<void> {
  await connectDB();
  await AiAttentionItem.updateOne(
    { tenantId, dedupeKey, status: AI_ATTENTION_STATUS.OPEN },
    { $set: { status: AI_ATTENTION_STATUS.AUTO_RESOLVED, resolvedAt: new Date() } },
  );
}

export async function resolveItem(tenantId: string, dedupeKey: string): Promise<void> {
  await connectDB();
  await AiAttentionItem.updateOne(
    { tenantId, dedupeKey },
    { $set: { status: AI_ATTENTION_STATUS.RESOLVED, resolvedAt: new Date() } },
  );
}
