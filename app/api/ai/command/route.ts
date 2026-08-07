import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";
import { runUniversalSearch } from "@/lib/search/universalSearch";
import { COMMAND_ACTIONS, COMMAND_ACTION_TYPES, CommandActionError, isCommandAction } from "@/lib/ai/commandActions";
import AiCommandProposal from "@/models/AiCommandProposal";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";
import { calculateForecast } from "@/lib/crm/forecast";

/**
 * AI Command Center dispatcher.
 *
 * One LLM call classifies the natural-language command into an intent, then we
 * dispatch to a REAL implementation for each:
 *   - navigate      → return a target URL.
 *   - search        → runUniversalSearch (the same cross-module, role-scoped
 *                     query as the header search box).
 *   - explain_report→ pull a compact live metrics snapshot and have the model
 *                     explain it in plain language (grounded in real numbers).
 *   - action        → resolve the target, build a preview, and store an
 *                     AiCommandProposal. NEVER executes here — the mutation only
 *                     happens after an explicit human confirm click via
 *                     /api/ai/command/actions/[id]/confirm.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!session || !tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = ((session.user as any).role || "").toLowerCase();

    const { command, context } = await req.json();
    if (!command) return NextResponse.json({ error: "No command provided" }, { status: 400 });

    const prompt = `You are the command dispatcher for Aupulens ERP. Classify the user's command into ONE intent and extract its parameters.

User command: "${command}"
Current page: "${context?.pathname ?? "unknown"}"

Intents:
- "navigate": user wants to go to a page. Provide "url".
- "search": user wants to FIND records (leads, invoices, customers, etc). Provide "searchTerm" (the thing to find).
- "explain_report": user wants an EXPLANATION of a report/metric/trend. Provide "reportType" (one of: "pipeline", "leads", "sales").
- "action": user wants to CHANGE data. Provide "actionType" (one of: ${COMMAND_ACTION_TYPES.join(", ")}) and "actionParams" (e.g. {"title":"...","dueInDays":3} for create_task; {"leadName":"...","status":"Qualified"} for update_lead_status; {"leadName":"..."} for delete_lead).
- "unknown": if none apply.

Return ONLY JSON (no markdown):
{"intent":"...","url":"...","searchTerm":"...","reportType":"...","actionType":"...","actionParams":{...},"message":"short friendly message"}`;

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { maxTokens: AI_MAX_TOKENS.intent });

    // strictNullChecks is off in this project — narrow on "text" in result.
    if (!("text" in result)) {
      return NextResponse.json({ error: result.error, code: result.code, action: "unknown" }, { status: 403 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim());
    } catch {
      return NextResponse.json({ action: "unknown", message: "I didn't quite understand that command." });
    }

    switch (parsed.intent) {
      case "navigate":
        return NextResponse.json({ action: "navigate", url: parsed.url, message: parsed.message || "Navigating…" });

      case "search": {
        const results = await runUniversalSearch(tenantId, role, parsed.searchTerm || command);
        return NextResponse.json({
          action: "search",
          results,
          message: results.length ? `Found ${results.length} result(s) for "${parsed.searchTerm}".` : `No results for "${parsed.searchTerm}".`,
        });
      }

      case "explain_report":
        return await explainReport(tenantId, tier, aiSettings, parsed.reportType || "pipeline", command);

      case "action":
        return await proposeAction(tenantId, session.user.id, role, parsed.actionType, parsed.actionParams || {});

      default:
        return NextResponse.json({ action: "unknown", message: parsed.message || "I didn't quite understand that command." });
    }
  } catch (error: any) {
    console.error("AI Command processing error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Build a compact, REAL metrics snapshot and have the model explain it. */
async function explainReport(tenantId: string, tier: string, aiSettings: any, reportType: string, command: string) {
  await connectDB();
  const openOpps = await CrmOpportunity.find({ tenantId, stage: { $nin: ["Closed Won", "Closed Lost"] } })
    .select("deal_name stage amount probability")
    .lean();
  const forecast = calculateForecast(openOpps as any[]);
  const leadCount = await CrmLead.countDocuments({ tenantId });
  const qualifiedLeads = await CrmLead.countDocuments({ tenantId, status: "Qualified" });

  const snapshot = {
    reportType,
    openOpportunities: openOpps.length,
    totalPipeline: forecast.totalPipeline,
    weightedPipeline: forecast.weightedPipeline,
    leadCount,
    qualifiedLeads,
    stageBreakdown: openOpps.reduce((acc: Record<string, number>, o: any) => { acc[o.stage] = (acc[o.stage] || 0) + 1; return acc; }, {}),
  };

  const prompt = `Explain this ERP report snapshot in plain language for a business user, answering their question. Use ONLY the numbers given — never invent figures. Be concise (3-5 sentences) and end with one actionable insight.

User question: "${command}"
Report snapshot (JSON): ${JSON.stringify(snapshot)}`;

  const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { maxTokens: AI_MAX_TOKENS.summary });
  if (!("text" in result)) {
    // Graceful non-AI fallback: return the raw snapshot so the user still sees data.
    return NextResponse.json({ action: "explain", message: `Pipeline: ${snapshot.openOpportunities} open deals worth ${snapshot.totalPipeline} (weighted ${snapshot.weightedPipeline}). ${snapshot.qualifiedLeads}/${snapshot.leadCount} leads qualified.`, snapshot, aiUsed: false });
  }
  return NextResponse.json({ action: "explain", message: result.text, snapshot, aiUsed: true });
}

/**
 * Resolve the action's target (by name) and build a proposal — the CONFIRM
 * GATE. Never mutates. For destructive actions we refuse to guess when the
 * name is ambiguous.
 */
async function proposeAction(tenantId: string, userId: string, _role: string, actionType: string, actionParams: any) {
  if (!actionType || !isCommandAction(actionType)) {
    return NextResponse.json({ action: "unknown", message: `I can't perform that action. I can: ${COMMAND_ACTION_TYPES.join(", ")}.` });
  }
  await connectDB();

  // Resolve a lead reference by name → id for lead-targeting actions.
  const params = { ...actionParams };
  if ((actionType === "update_lead_status" || actionType === "delete_lead") && !params.leadId && params.leadName) {
    const matches = await CrmLead.find({ tenantId, lead_name: new RegExp(params.leadName, "i") }).select("lead_name").limit(2).lean();
    if (matches.length === 0) return NextResponse.json({ action: "unknown", message: `No lead named "${params.leadName}" found.` });
    if (matches.length > 1) return NextResponse.json({ action: "unknown", message: `Multiple leads match "${params.leadName}". Please be more specific.` });
    params.leadId = String((matches[0] as any)._id);
  }

  try {
    const def = COMMAND_ACTIONS[actionType];
    const { summary, preview } = await def.buildPreview(params, tenantId);
    const proposal = await AiCommandProposal.create({
      tenantId, userId, module: def.module, actionType, destructive: def.destructive,
      params, preview, summary, expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    return NextResponse.json({
      action: "confirm",
      proposalId: proposal._id,
      actionType,
      destructive: def.destructive,
      summary,
      preview,
      requiresConfirmation: true,
      message: `${summary} Confirm to proceed.`,
    });
  } catch (error: any) {
    if (error instanceof CommandActionError) return NextResponse.json({ action: "unknown", message: error.message });
    throw error;
  }
}
