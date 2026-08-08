/**
 * Real action runners for Aupulens Studio + the runWorkflow entry point.
 *
 * Each runner performs a genuine effect (create a Notification, POST a webhook,
 * call the LLM) and returns a short result string for the run log. They are
 * plain async functions so the pure engine (engine.ts) can be tested with fakes.
 */

import crypto from "node:crypto";
import mongoose from "mongoose";
import Workflow, { type IWorkflow } from "@/models/Workflow";
import WorkflowRun from "@/models/WorkflowRun";
import CrmNotification from "@/models/crm/Notification";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { interpolate } from "@/lib/studio/conditions";
import { WORKFLOW_ACTION_TYPE } from "@/lib/studio/catalog";
import { executeSteps, type ActionRunnerMap, type RunContext } from "@/lib/studio/engine";

const str = (params: Record<string, unknown>, key: string, ctx: RunContext): string =>
  interpolate(String(params[key] ?? ""), ctx.vars);

export const REAL_RUNNERS: ActionRunnerMap = {
  [WORKFLOW_ACTION_TYPE.LOG]: async (params, ctx) => {
    return `Logged: ${str(params, "message", ctx)}`;
  },

  [WORKFLOW_ACTION_TYPE.SET_CONTEXT]: async (params, ctx) => {
    const key = String(params.key ?? "").trim();
    if (!key) throw new Error("set_context requires a variable name");
    ctx.vars[key] = str(params, "value", ctx);
    return `Set ${key}`;
  },

  [WORKFLOW_ACTION_TYPE.NOTIFY]: async (params, ctx) => {
    if (!ctx.userId) throw new Error("No owner to notify");
    await CrmNotification.create({
      tenantId: ctx.tenantId,
      userId: new mongoose.Types.ObjectId(ctx.userId),
      type: "AutomationAlert",
      title: str(params, "title", ctx) || "Workflow notification",
      message: str(params, "message", ctx),
      deliveryMethod: "InApp",
    });
    return "Notification created";
  },

  [WORKFLOW_ACTION_TYPE.WEBHOOK]: async (params, ctx) => {
    const url = str(params, "url", ctx);
    if (!/^https?:\/\//.test(url)) throw new Error("Webhook URL must be http(s)");
    const body = JSON.stringify({ vars: ctx.vars, firedAt: new Date().toISOString() });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const secret = String(params.secret ?? "");
    if (secret) headers["X-Aupulens-Signature"] = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Webhook returned HTTP ${res.status}`);
    return `Webhook delivered (HTTP ${res.status})`;
  },

  [WORKFLOW_ACTION_TYPE.AI_SUMMARIZE]: async (params, ctx) => {
    const instruction = str(params, "instruction", ctx);
    const outputKey = String(params.outputKey ?? "aiResult").trim() || "aiResult";
    const { tier, aiSettings } = await resolveTenantAiSettings(ctx.tenantId);
    const result = await callClaudeForTenant(
      ctx.tenantId,
      tier,
      aiSettings,
      `${instruction}\n\nContext (JSON):\n${JSON.stringify(ctx.vars).slice(0, 8000)}`,
      { systemPrompt: "You are an ERP automation assistant. Be concise and factual.", maxTokens: 600 },
    );
    if (!("text" in result)) throw new Error(result.error);
    ctx.vars[outputKey] = result.text;
    return `AI result stored in ${outputKey}`;
  },
};

/**
 * Run a workflow against a payload and persist a WorkflowRun. Used by the manual
 * test-run route and the event dispatcher.
 */
export async function runWorkflow(
  workflow: IWorkflow,
  payload: Record<string, unknown>,
  opts: { trigger: string; userId?: string },
): Promise<{ status: string; stepResults: unknown[]; runId: mongoose.Types.ObjectId }> {
  const ctx: RunContext = {
    tenantId: workflow.tenantId,
    userId: opts.userId ?? String(workflow.createdBy),
    vars: { payload },
  };

  const result = await executeSteps(workflow.conditions || [], workflow.steps || [], ctx, REAL_RUNNERS);

  const run = await WorkflowRun.create({
    tenantId: workflow.tenantId,
    workflowId: workflow._id,
    workflowVersion: workflow.version,
    trigger: opts.trigger,
    status: result.status,
    conditionsMet: result.conditionsMet,
    stepResults: result.stepResults,
    error: result.error,
  });

  await Workflow.updateOne({ _id: workflow._id }, { $set: { lastRunAt: new Date() } });

  return { status: result.status, stepResults: result.stepResults, runId: run._id as mongoose.Types.ObjectId };
}
