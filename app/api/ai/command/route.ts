import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";
import { runCombinedSearch } from "@/lib/search/universalSearch";
import { COMMAND_ACTIONS, COMMAND_ACTION_TYPES, CommandActionError, isCommandAction } from "@/lib/ai/commandActions";
import { resolveNavDestination, topNavSuggestions } from "@/lib/ai/navRoutes";
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
- "navigate": user wants to OPEN / GO TO a page. Provide "destination" = the page in plain words (e.g. "leads", "customers", "invoices", "profit and loss", "employees"). Do NOT invent or guess a URL path — just the destination words.
- "search": user wants to FIND records (leads, invoices, customers, etc). Provide "searchTerm" (the thing to find).
- "explain_report": user wants an EXPLANATION of a report/metric/trend. Provide "reportType" (one of: "pipeline", "leads", "sales").
- "action": user wants to CREATE, CHANGE, or DELETE data. Provide "actionType" (one of: ${COMMAND_ACTION_TYPES.join(", ")}) and "actionParams". Examples:
    • create_task → {"title":"...","dueInDays":3}
    • update_lead_status → {"leadName":"...","status":"Qualified"}
    • delete_lead → {"leadName":"..."}
    • create_lead → {"lead_name":"...","company_name":"...","email":"...","phone":"...","source":"Referral"}
    • create_customer → {"name":"...","is_company":true,"email":"...","phone":"...","gstin":"...","currency":"INR"}
    • create_employee → {"firstName":"...","lastName":"...","email":"...","phone":"...","designation":"...","employmentType":"full-time"}
    • create_ledger → {"name":"...","type":"expense|income|asset|liability|equity|bank|cash|receivable|payable"}
    • delete_ledger → {"name":"..."}
    • create_invoice → {"customerName":"...","lineItems":[{"name":"...","qty":1,"unitPrice":1000,"taxRate":18,"hsn":"..."}],"notes":"...","reference":"..."}
    • create_journal_entry → {"narration":"...","journalType":"general|sale|purchase|cash|bank","lines":[{"account":"<ledger name>","debit":5000,"credit":0,"label":"..."},{"account":"<ledger name>","debit":0,"credit":5000}]}  (debits MUST equal credits; each line is debit XOR credit)
  Extract every detail the user gives (names, emails, phones, amounts, GSTIN, quantities, tax rates) into actionParams. Do NOT invent values the user did not state. For journal entries, infer the correct debit/credit sides so the entry balances, using ledger names as the user refers to them.
- "batch": user wants MULTIPLE actions in one request (e.g. "create a customer AND an invoice for them", "add a lead and a follow-up task and a ledger"). Provide "actions": an ARRAY of {"actionType":"...","actionParams":{...}} using the SAME actionTypes/params as "action" above, ordered so that anything others depend on is created FIRST (e.g. create the customer before the invoice that references it).
- "unknown": if none apply.

Return ONLY JSON (no markdown):
{"intent":"...","destination":"...","searchTerm":"...","reportType":"...","actionType":"...","actionParams":{...},"actions":[{"actionType":"...","actionParams":{...}}],"message":"short friendly message"}`;

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
      case "navigate": {
        // Resolve against REAL app routes — never trust an AI-guessed URL (that
        // caused 404s like /admin/leads). Fall back to the raw command so
        // "go to leads" resolves even if the model omits "destination".
        const dest = resolveNavDestination(parsed.destination || parsed.url || parsed.searchTerm || command);
        if (dest) {
          return NextResponse.json({ action: "navigate", url: dest.href, message: `Opening ${dest.title}…` });
        }
        // No confident match → offer a search instead of navigating somewhere wrong.
        const { results } = await runCombinedSearch(tenantId, role, parsed.searchTerm || command, { semantic: true });
        if (results.length) {
          return NextResponse.json({ action: "search", results, message: `I couldn't find a page called that, but here are matching records.` });
        }
        return NextResponse.json({ action: "unknown", message: `I couldn't find that page. I can open pages like: ${topNavSuggestions().join(", ")}.` });
      }

      case "search": {
        // Natural-language commands benefit most from the semantic layer.
        const { results } = await runCombinedSearch(tenantId, role, parsed.searchTerm || command, { semantic: true });
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

      case "batch":
        return await proposeBatch(tenantId, session.user.id, role, parsed.actions || []);

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
/**
 * Resolve name-based references to ids for actions that target an existing
 * record (e.g. a lead by name). Throws CommandActionError on missing/ambiguous
 * so both single and batch proposals report it the same way. Create-type actions
 * resolve their own targets inside buildPreview/execute, so this is a no-op for them.
 */
async function resolveActionParams(actionType: string, actionParams: any, tenantId: string) {
  const params = { ...actionParams };
  if ((actionType === "update_lead_status" || actionType === "delete_lead") && !params.leadId && params.leadName) {
    const matches = await CrmLead.find({ tenantId, lead_name: new RegExp(params.leadName, "i") }).select("lead_name").limit(2).lean();
    if (matches.length === 0) throw new CommandActionError(`No lead named "${params.leadName}" found.`);
    if (matches.length > 1) throw new CommandActionError(`Multiple leads match "${params.leadName}". Please be more specific.`);
    params.leadId = String((matches[0] as any)._id);
  }
  return params;
}

async function proposeAction(tenantId: string, userId: string, _role: string, actionType: string, actionParams: any) {
  if (!actionType || !isCommandAction(actionType)) {
    return NextResponse.json({ action: "unknown", message: `I can't perform that action. I can: ${COMMAND_ACTION_TYPES.join(", ")}.` });
  }
  await connectDB();

  try {
    const params = await resolveActionParams(actionType, actionParams, tenantId);
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

/**
 * Multi-action proposal. Validates each step (best-effort — a step that depends
 * on an earlier one gets a soft summary since its target won't exist until
 * execute time), stores ONE proposal, and returns a single confirm card listing
 * every step. Execution (sequential, in order) happens only on confirm.
 */
async function proposeBatch(tenantId: string, userId: string, _role: string, actions: any[]) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return NextResponse.json({ action: "unknown", message: "I couldn't find any actions to perform." });
  }
  await connectDB();
  try {
    const steps: { actionType: string; params: any; summary: string; destructive: boolean }[] = [];
    for (const a of actions) {
      const actionType = a?.actionType;
      if (!actionType || !isCommandAction(actionType)) {
        return NextResponse.json({ action: "unknown", message: `I can't perform "${actionType}". I can: ${COMMAND_ACTION_TYPES.join(", ")}.` });
      }
      const params = await resolveActionParams(actionType, a.actionParams || {}, tenantId);
      const def = COMMAND_ACTIONS[actionType];
      let summary: string;
      try {
        summary = (await def.buildPreview(params, tenantId)).summary;
      } catch (e) {
        if (e instanceof CommandActionError) {
          summary = `${actionType.replace(/_/g, " ")} — will run after the earlier steps`;
        } else throw e;
      }
      steps.push({ actionType, params, summary, destructive: def.destructive });
    }

    const anyDestructive = steps.some((s) => s.destructive);
    const combined = steps.map((s, i) => `${i + 1}. ${s.summary}`).join("\n");
    const preview = { steps: steps.map((s) => ({ actionType: s.actionType, summary: s.summary })) };
    const proposal = await AiCommandProposal.create({
      tenantId, userId, module: "batch", actionType: "batch", destructive: anyDestructive,
      params: { steps: steps.map((s) => ({ actionType: s.actionType, params: s.params })) },
      preview, summary: combined, expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    return NextResponse.json({
      action: "confirm",
      proposalId: proposal._id,
      actionType: "batch",
      destructive: anyDestructive,
      summary: combined,
      preview,
      requiresConfirmation: true,
      message: `I'll do ${steps.length} thing(s):\n${combined}`,
    });
  } catch (error: any) {
    if (error instanceof CommandActionError) return NextResponse.json({ action: "unknown", message: error.message });
    throw error;
  }
}
