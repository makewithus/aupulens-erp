/**
 * Half-finished tasks live in AiCommandProposal — the existing propose→confirm→execute record with
 * its TTL index — not a new mechanism. status: proposed = in progress, confirmed = form opened,
 * executed = created (execute path), rejected = cancelled/replaced, expired = TTL passed.
 */
import mongoose from "mongoose";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import { AI_ACTION_STATUS } from "@/lib/constants/statuses";
import type { FlowState } from "./engine";

export const TASK_FLOW_TTL_MS = 30 * 60_000;
const PREFIX = "task_flow.";

export interface LoadedSession { id: string; state: FlowState }

export async function loadActiveSession(tenantId: string, userId: string): Promise<LoadedSession | null> {
  const doc: any = await AiCommandProposal.findOne({
    tenantId, userId: new mongoose.Types.ObjectId(userId),
    actionType: { $regex: `^${PREFIX.replace(".", "\\.")}` }, status: AI_ACTION_STATUS.PROPOSED,
  }).sort({ updatedAt: -1 });
  if (!doc) return null;
  if (doc.expiresAt.getTime() <= Date.now()) {
    doc.status = AI_ACTION_STATUS.EXPIRED;
    await doc.save();
    return null;
  }
  return { id: String(doc._id), state: doc.params.state as FlowState };
}

export async function saveSession(tenantId: string, userId: string, moduleKey: string, state: FlowState, existingId?: string, summary = ""): Promise<string> {
  const expiresAt = new Date(Date.now() + TASK_FLOW_TTL_MS);
  if (existingId) {
    await AiCommandProposal.updateOne({ _id: existingId, tenantId }, { $set: { params: { state }, summary, expiresAt } });
    return existingId;
  }
  const doc = await AiCommandProposal.create({
    tenantId, userId: new mongoose.Types.ObjectId(userId), module: moduleKey,
    actionType: `${PREFIX}${state.target}`, destructive: false, params: { state }, preview: {}, summary,
    status: AI_ACTION_STATUS.PROPOSED, expiresAt,
  });
  return String(doc._id);
}

export async function closeSession(tenantId: string, id: string, status: "confirmed" | "executed" | "rejected", resultRef?: string): Promise<void> {
  await AiCommandProposal.updateOne(
    { _id: id, tenantId },
    { $set: { status, ...(resultRef ? { resultRef } : {}), ...(status === "executed" ? { executedAt: new Date() } : {}) } },
  );
}
