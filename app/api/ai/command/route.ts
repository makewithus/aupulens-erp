import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";
import { runCombinedSearch } from "@/lib/search/universalSearch";
import { COMMAND_ACTIONS, COMMAND_ACTION_TYPES, CommandActionError, isCommandAction } from "@/lib/ai/commandActions";
import { resolveNavDestination, topNavSuggestions } from "@/lib/ai/navRoutes";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";
import { calculateForecast } from "@/lib/crm/forecast";
import { resolveWorkflowIntentCheap, unmatchedResponse } from "@/lib/aiRuntime/nl/resolveIntent";
import { handleWorkflowIntent } from "@/lib/aiRuntime/nl/workflowChatHandler";
import { resolveReference } from "@/lib/aiRuntime/nl/resolveReference";
import { loadSession, saveSession, recordTurn, rememberResultSet, clearPending, clearClarification, clearProposal, type AiNlSessionState, type AiNlResultItem } from "@/lib/aiRuntime/nl/conversationMemory";
import { listWorkflows } from "@/lib/aiRuntime/runtime/registry";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { AI_ACTION_STATUS } from "@/lib/constants/statuses";

/**
 * Conversational memory (Chunk 9, Part D — docs/ai/BRIEF-09-VERIFICATION.md). `finalize()` is the
 * single place every response passes through: records the assistant's turn, remembers a fresh
 * result set when a response carries citations (the ONLY thing a later "the second one"/"that
 * one" reference is allowed to resolve against — see resolveReference.ts), tracks/clears a
 * pending proposal, and attaches `conversationId` so the client can carry it to the next turn.
 * Every existing branch's own response shape is untouched — this only wraps it.
 */
async function finalize(res: NextResponse, priorSession: AiNlSessionState, opts?: { preserveClarification?: boolean }): Promise<NextResponse> {
  const body = await res.clone().json().catch(() => ({}) as Record<string, unknown>);
  let updated = recordTurn(priorSession, "assistant", String((body as any).message ?? ""));

  const citations = (body as any).citations;
  const workflowId = (body as any).workflowId;
  if (Array.isArray(citations) && citations.length > 0 && workflowId) {
    const items: AiNlResultItem[] = citations.map((c: any) => ({ id: String(c.ref), model: String(c.kind), label: String(c.label) }));
    updated = rememberResultSet(updated, String(workflowId), items, (body as any).resultRef ? String((body as any).resultRef) : undefined);
  }

  if (!opts?.preserveClarification) updated = clearClarification(updated);

  if ((body as any).action === "confirm" && (body as any).proposalId) {
    updated = {
      ...updated,
      pendingProposal: {
        proposalId: String((body as any).proposalId),
        workflowId: String(workflowId ?? (body as any).actionType ?? "unknown"),
        summary: String((body as any).summary ?? (body as any).message ?? ""),
        createdAt: new Date().toISOString(),
      },
    };
  } else {
    updated = clearProposal(updated);
  }

  await saveSession(updated);
  return NextResponse.json({ ...(body as object), conversationId: priorSession.conversationId }, { status: res.status });
}

/** D.2's "meta" reference type ("why did it flag that", "tell me more about that one") — answers
 *  from the SAME run's own findings, never the model's own recollection. The remembered item's id
 *  is looked up against that run's real `subjectRefs`, so this can only ever surface a finding
 *  this tenant's own workflow run actually produced. */
async function explainRememberedItem(tenantId: string, session: AiNlSessionState, item: AiNlResultItem): Promise<{ message: string; citations: { kind: string; ref: string; label: string }[] }> {
  await connectDB();
  const runId = session.resultSet?.runId;
  if (runId) {
    const run = await AiWorkflowRun.findOne({ _id: runId, tenantId }).lean();
    const match = run?.findings?.find((f: any) => (f.subjectRefs || []).some((r: any) => String(r.id) === item.id && r.model === item.model));
    if (match) {
      const lines = [`${match.title}: ${match.detail}`];
      if (Array.isArray(match.reasonChain) && match.reasonChain.length) lines.push(...match.reasonChain.map((r: string) => `- ${r}`));
      return { message: lines.join("\n"), citations: (match.evidence || []).map((e: any) => ({ kind: e.kind, ref: e.ref, label: e.label })) };
    }
  }
  return { message: `Here's what I have on ${item.label}: it was part of the last ${session.resultSet?.workflowId ?? "workflow"} result, but I don't have further detail recorded for it.`, citations: [] };
}

/** D.2's "undo" reference type — rejects the remembered pending proposal, same operation as the
 *  explicit reject button (`app/api/ai/command/actions/[id]/reject/route.ts`), reachable from chat. */
async function undoPendingProposal(tenantId: string, session: AiNlSessionState): Promise<string> {
  if (!session.pendingProposal) return "There's nothing pending to undo.";
  await connectDB();
  const proposal = await AiCommandProposal.findOne({ _id: session.pendingProposal.proposalId, tenantId });
  if (!proposal || proposal.status !== AI_ACTION_STATUS.PROPOSED) return "That proposal is no longer pending — nothing to undo.";
  proposal.status = AI_ACTION_STATUS.REJECTED;
  await proposal.save();
  return `Cancelled: ${session.pendingProposal.summary}`;
}

/**
 * AI Command Center dispatcher.
 *
 * AI-NL (docs/ai/BRIEF-08b-FINAL.md Part B) widens this from seven hard-coded accounting actions
 * to the 30 registered AI runtime workflows — same proposal record (`AiCommandProposal`), same
 * confirm gate, same TTL, no second chat. **Resolution is layered, cheapest first**: a curated
 * keyword table (`lib/aiRuntime/nl/resolveIntent.ts`) is tried BEFORE any LLM call; only an
 * utterance it can't match falls through to the LLM classification below, whose own prompt is
 * extended with a `"workflow"` intent constrained to the real registry (`listWorkflows()`) —
 * never a workflow id the model invented. **If this whole layer were deleted, all 30 workflows
 * keep running on their triggers and schedules** — nothing here is imported by
 * `lib/aiRuntime/runtime/**`, `lib/aiRuntime/bootstrap.ts`, or any cron route (asserted directly,
 * `tests/ai/aiRuntime/aiNl.test.ts`).
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
 *   - workflow      → AI-NL: resolve to a registered AI-XX workflow and run it (OBSERVE) or
 *                     preview + propose it (above OBSERVE) through the exact same executor and
 *                     autonomy gate an event trigger uses.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!session || !tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = ((session.user as any).role || "").toLowerCase();
    const userId = String((session.user as any).id ?? "");

    const { command, context, conversationId: incomingConversationId } = await req.json();
    if (!command) return NextResponse.json({ error: "No command provided" }, { status: 400 });

    // Chunk 9, Part D — conversational memory. A fresh conversationId is minted on the first turn
    // and echoed back in every response; the client carries it forward so the next turn's
    // resolveReference() has something to resolve against. Loading/permission is re-derived fresh
    // every turn from this request's own tenantId/userId (D.4) — nothing here widens what the
    // session can see beyond what THIS request is already allowed to touch.
    const conversationId: string = typeof incomingConversationId === "string" && incomingConversationId ? incomingConversationId : randomUUID();
    let nlSession = await loadSession(tenantId, userId, conversationId);
    nlSession = recordTurn(nlSession, "user", String(command));

    // Reference resolution (D.2) — tried BEFORE any fresh-intent classification, and only ever
    // does anything if the session actually has a result set/pending state to resolve against
    // (resolveReference short-circuits to "not_a_reference" for free otherwise). A resolved
    // reference always continues through the exact same handleWorkflowIntent() path a fresh
    // command would use — never a shortcut that skips the autonomy gate.
    const reference = await resolveReference(tenantId, command, nlSession);
    if (reference.type === "explain_item" && reference.item) {
      const { message, citations } = await explainRememberedItem(tenantId, nlSession, reference.item);
      return finalize(NextResponse.json({ action: "explain", message, citations, workflowId: nlSession.resultSet?.workflowId }), nlSession);
    }
    if (reference.type === "undo") {
      const message = await undoPendingProposal(tenantId, nlSession);
      return finalize(NextResponse.json({ action: "explain", message }), clearPending(nlSession));
    }
    if (reference.type === "clarify" && reference.question) {
      const withClarification: AiNlSessionState = {
        ...nlSession,
        pendingClarification: {
          question: reference.question,
          forWorkflowId: nlSession.resultSet?.workflowId ?? nlSession.pendingClarification?.forWorkflowId ?? "",
          forEventKey: nlSession.pendingClarification?.forEventKey ?? "ai.sweep.hourly",
          forParameters: nlSession.pendingClarification?.forParameters ?? {},
          askedAt: new Date().toISOString(),
        },
      };
      return finalize(NextResponse.json({ action: "clarify", message: reference.question }), withClarification, { preserveClarification: true });
    }
    if (reference.type === "rerun" && reference.workflowId) {
      const result = await handleWorkflowIntent(tenantId, userId, reference.workflowId, reference.eventKey ?? "ai.sweep.hourly", reference.parameters ?? {});
      return finalize(NextResponse.json({ ...result, resolvedBy: "reference" }), nlSession);
    }

    // Layer 1/2 — cheap, deterministic, no LLM call (docs/ai/BRIEF-08b-FINAL.md B.1).
    bootstrapAiRuntime();
    const cheapMatch = resolveWorkflowIntentCheap(command);
    if (cheapMatch) {
      if (cheapMatch.alternatives.length > 0) {
        return finalize(NextResponse.json({
          action: "clarify",
          message: `Did you mean ${cheapMatch.workflowId}, or one of: ${cheapMatch.alternatives.join(", ")}? Please say which.`,
          resolvedBy: cheapMatch.resolvedBy,
        }), nlSession);
      }
      const result = await handleWorkflowIntent(tenantId, userId, cheapMatch.workflowId, cheapMatch.eventKey, cheapMatch.parameters);
      return finalize(NextResponse.json({ ...result, resolvedBy: cheapMatch.resolvedBy }), nlSession);
    }

    const registeredWorkflowIds = listWorkflows().map((w) => w.id);

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
- "workflow": user wants the AI OPERATING LAYER to DO or EXPLAIN something it already owns — reconcile an account, explain a margin/variance, prepare accruals, check close readiness, find duplicate bills/payments, chase collections, forecast cash, show supporting evidence for a number, or explain why the system did something. Provide "workflowId" — ONE of exactly these registered ids, never another: ${registeredWorkflowIds.join(", ")}. Pick the closest real match; if truly nothing fits, use "unknown" instead.
- "unknown": if none apply.

Return ONLY JSON (no markdown):
{"intent":"...","destination":"...","searchTerm":"...","reportType":"...","actionType":"...","actionParams":{...},"actions":[{"actionType":"...","actionParams":{...}}],"workflowId":"...","message":"short friendly message"}`;

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { maxTokens: AI_MAX_TOKENS.intent });

    // strictNullChecks is off in this project — narrow on "text" in result.
    if (!("text" in result)) {
      return finalize(NextResponse.json({ error: result.error, code: result.code, action: "unknown" }, { status: 403 }), nlSession);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim());
    } catch {
      return finalize(NextResponse.json({ action: "unknown", message: "I didn't quite understand that command." }), nlSession);
    }

    switch (parsed.intent) {
      case "navigate": {
        // Resolve against REAL app routes — never trust an AI-guessed URL (that
        // caused 404s like /admin/leads). Fall back to the raw command so
        // "go to leads" resolves even if the model omits "destination".
        const dest = resolveNavDestination(parsed.destination || parsed.url || parsed.searchTerm || command);
        if (dest) {
          return finalize(NextResponse.json({ action: "navigate", url: dest.href, message: `Opening ${dest.title}…` }), nlSession);
        }
        // No confident match → offer a search instead of navigating somewhere wrong.
        const { results } = await runCombinedSearch(tenantId, role, parsed.searchTerm || command, { semantic: true });
        if (results.length) {
          return finalize(NextResponse.json({ action: "search", results, message: `I couldn't find a page called that, but here are matching records.` }), nlSession);
        }
        return finalize(NextResponse.json({ action: "unknown", message: `I couldn't find that page. I can open pages like: ${topNavSuggestions().join(", ")}.` }), nlSession);
      }

      case "search": {
        // Natural-language commands benefit most from the semantic layer.
        const { results } = await runCombinedSearch(tenantId, role, parsed.searchTerm || command, { semantic: true });
        return finalize(NextResponse.json({
          action: "search",
          results,
          message: results.length ? `Found ${results.length} result(s) for "${parsed.searchTerm}".` : `No results for "${parsed.searchTerm}".`,
        }), nlSession);
      }

      case "explain_report":
        return finalize(await explainReport(tenantId, tier, aiSettings, parsed.reportType || "pipeline", command), nlSession);

      case "action":
        return finalize(await proposeAction(tenantId, session.user.id, role, parsed.actionType, parsed.actionParams || {}), nlSession);

      case "batch":
        return finalize(await proposeBatch(tenantId, session.user.id, role, parsed.actions || []), nlSession);

      case "workflow": {
        if (!parsed.workflowId || !registeredWorkflowIds.includes(parsed.workflowId)) {
          const fallback = unmatchedResponse(command);
          return finalize(NextResponse.json({ action: "unknown", message: fallback.message, suggestions: fallback.suggestions }), nlSession);
        }
        const result = await handleWorkflowIntent(tenantId, userId, parsed.workflowId, "ai.sweep.hourly", {});
        return finalize(NextResponse.json({ ...result, resolvedBy: "llm" }), nlSession);
      }

      default: {
        const fallback = unmatchedResponse(command);
        return finalize(NextResponse.json({ action: "unknown", message: parsed.message || fallback.message, suggestions: fallback.suggestions }), nlSession);
      }
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
