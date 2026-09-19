/**
 * One turn of the assistant-guided task flow.
 *   raw text → language pipeline → NORMALISED ENGLISH → explain/do/ask classifier → slot engine
 *   → reply (translated back) → session save.
 * The classifier and the engine only ever see the pipeline's English (Part 1.1). No LLM is
 * involved: intent, parsing and questions are deterministic, which keeps a turn under ~1s and
 * makes every outcome auditable. Azure OpenAI is not called here.
 */
import { prepareLanguageInput } from "@/lib/ai/language/pipeline";
import { respondInLanguage, wantsRegionalReply } from "@/lib/ai/language/respond";
import { finaliseLanguage } from "@/lib/ai/language/tenantBridge";
import type { LanguageTrace } from "@/lib/ai/language/types";
import { todayIST } from "./dates";
import {
  explainReply, newState, startFlow, stepFlow, classifyIntent,
  type FlowReply, type FlowState, type Lookups, type StepInput, type StepOutput,
} from "./engine";
import { FlowAccessError, type InternalCtx, createLookups, createViaRoute } from "./http";
import { TASK_TARGETS, type TaskTarget } from "./registry";
import type { LoadedSession } from "./session";

export interface TaskFlowInput {
  tenantId: string;
  userId: string;
  role: string;
  text: string;
  /** client believes a draft is open (used only to say "it expired" cleanly) */
  expectSession?: boolean;
  aiSettings: { disabled?: boolean; multilingualDisabled?: boolean; autoCreateEnabled?: boolean };
  http: InternalCtx;
}

export interface TaskFlowDeps {
  loadSession(tenantId: string, userId: string): Promise<LoadedSession | null>;
  saveSession(tenantId: string, userId: string, moduleKey: string, state: FlowState, id?: string, summary?: string): Promise<string>;
  closeSession(tenantId: string, id: string, status: "confirmed" | "executed" | "rejected", resultRef?: string): Promise<void>;
  /** true when the tenant may still spend AI/translation calls this month */
  aiAllowed(tenantId: string): Promise<boolean>;
  /** count a translated turn against the tenant's AI quota (combined-usage rule) */
  chargeTranslation(tenantId: string): Promise<void>;
  lookups?: Lookups;
  now?: () => Date;
}

export interface TaskFlowResponse {
  handled: boolean;
  sessionActive: boolean;
  kind: FlowReply["kind"] | "refused";
  message: string;
  /** the pipeline's English — lets the legacy create flow classify regional input too */
  english: string;
  route?: string;
  prefill?: Record<string, unknown>;
  target?: string;
  progress?: { current: number; total: number };
  choices?: string[];
  language: { detected: string; degraded: boolean; interpretation?: string; original: string };
}

const pickTarget = (english: string): { t: TaskTarget; intent: ReturnType<typeof classifyIntent> } | null => {
  for (const t of Object.values(TASK_TARGETS)) {
    const intent = classifyIntent(english, t.nounRx);
    if (intent !== "none") return { t, intent };
  }
  return null;
};

export async function handleTaskFlow(inp: TaskFlowInput, deps: TaskFlowDeps): Promise<TaskFlowResponse> {
  const today = todayIST(deps.now?.());
  const session = await deps.loadSession(inp.tenantId, inp.userId);

  // Translation is a paid call: only for tenants still inside their AI allowance and switched on.
  const allowed = inp.aiSettings.disabled === true ? false : await deps.aiAllowed(inp.tenantId);
  const trace: LanguageTrace = await prepareLanguageInput({
    tenantId: inp.tenantId,
    rawText: inp.text,
    multilingualDisabled: inp.aiSettings.multilingualDisabled === true || !allowed,
  });
  const english = trace.modelText;

  const respond = async (reply: FlowReply, extra: Partial<TaskFlowResponse> = {}): Promise<TaskFlowResponse> => {
    const r = reply.kind === "not_handled" ? { text: "", calls: [] } : await respondInLanguage(reply.message, trace);
    const calls = r.calls;
    if (trace.providerCalls.length || calls.length) await deps.chargeTranslation(inp.tenantId);
    await finaliseLanguage(inp.tenantId, "task_flow", trace, calls, inp.userId);
    return {
      handled: reply.kind !== "not_handled",
      sessionActive: false,
      kind: reply.kind,
      message: r.text,
      english,
      progress: reply.progress,
      choices: reply.choices,
      language: { detected: trace.detectedLanguage, degraded: trace.degraded, interpretation: trace.changedMaterially ? trace.interpretation : undefined, original: trace.original },
      ...extra,
    };
  };

  const stepIn = (autoCreate: boolean): StepInput => ({
    english,
    original: inp.text,
    today,
    degraded: trace.degraded,
    translated: !trace.degraded && trace.kind !== "english" && trace.kind !== "none",
    protectedNames: trace.entitiesProtected.filter((e) => e.type === "name" || e.type === "quoted").map((e) => e.value.replace(/^["'“‘]|["'”’]$/g, "")),
    autoCreate,
  });

  // ── decide: continue a draft, or classify a new request ──────────────────────
  let state: FlowState | null = session?.state ?? null;
  let sessionId = session?.id;

  let decided: { t: TaskTarget; out: StepOutput } | null = null;
  const lookups = deps.lookups ?? createLookups(inp.http);

  try {
    if (state) {
      const t = TASK_TARGETS[state.target];
      const fresh = classifyIntent(english, t.nounRx) === "do" && /\b(?:create|make|generate|draft|prepare|raise)\b/i.test(english);
      if (fresh) {
        // A brand-new complete request replaces the open draft.
        if (sessionId) await deps.closeSession(inp.tenantId, sessionId, "rejected");
        state = null; sessionId = undefined;
      } else {
        const auto = inp.aiSettings.autoCreateEnabled === true;
        decided = { t, out: await stepFlow(state, stepIn(auto), lookups) };
        if (decided.out.reply.kind === "not_handled") {
          // unrelated message: draft stays open, the caller answers normally
          return await respond(decided.out.reply, { sessionActive: true });
        }
      }
    }

    if (!decided) {
      const picked = pickTarget(english);
      if (!picked) {
        if (inp.expectSession && !session) {
          return await respond({ kind: "notice", message: "That draft has expired, so nothing was created. Say \"create an invoice\" to start again." });
        }
        return await respond({ kind: "not_handled", message: "" });
      }
      const { t, intent } = picked;
      if (!t.allowedRoles.includes(inp.role)) {
        return await respond({ kind: "notice", message: `You don't have access to create ${t.label}s with your current role. Ask your workspace admin if you need it.` }, { kind: "refused", handled: true });
      }
      const auto = inp.aiSettings.autoCreateEnabled === true;
      if (intent === "explain") {
        decided = { t, out: { state: null, reply: explainReply(t.id) } };
      } else if (intent === "ambiguous") {
        const st = newState(t.id, "intent");
        decided = { t, out: { state: st, reply: { kind: "ask_intent", message: `Do you want me to explain how to create an ${t.label}, or create one for you now?\n\n1. Explain how to create it\n2. Create it for me`, choices: ["Explain how to create it", "Create it for me"] } } };
      } else {
        decided = { t, out: await startFlow(t.id, stepIn(auto), lookups) };
      }
    }
  } catch (err) {
    if (err instanceof FlowAccessError) {
      return await respond({ kind: "notice", message: "You don't have access to Sales in this workspace, so I can't create an invoice for you." }, { kind: "refused", handled: true });
    }
    console.error("[task-flow] error, failing open:", err instanceof Error ? err.message : String(err));
    // Never break the assistant: let the normal Q&A path answer.
    return await respond({ kind: "not_handled", message: "" });
  }

  let { t, out } = decided;
  let reply = out.reply;
  let nextState = out.state;

  // ── execute path (only when the tenant flag is on) ───────────────────────────
  if (reply.kind === "execute" && reply.payload) {
    const res = await createViaRoute(inp.http, t.createEndpoint, reply.payload);
    if (res.ok === true) {
      if (sessionId) await deps.closeSession(inp.tenantId, sessionId, "executed", res.id);
      return await respond({ kind: "open_form", message: `Done — I created the ${t.label} as a draft. Opening it now.` }, { route: t.recordRoute(res.id), target: t.id, sessionActive: false });
    }
    // Keep every collected answer so the user does not start over.
    reply = { kind: "notice", message: `I couldn't create the ${t.label}: ${(res as { message: string }).message}. Your answers are saved — say "yes" to try again, "open form" to finish it in the form, or "cancel".` };
    nextState = nextState ?? state;
    if (nextState) nextState.stage = "confirming";
  }

  // ── persist / close ──────────────────────────────────────────────────────────
  let sessionActive = false;
  if (nextState) {
    const id = await deps.saveSession(inp.tenantId, inp.userId, t.module, nextState, sessionId, reply.message.slice(0, 200));
    sessionId = id;
    sessionActive = true;
  } else if (sessionId) {
    await deps.closeSession(inp.tenantId, sessionId, reply.kind === "open_form" ? "confirmed" : "rejected");
  }

  const extra: Partial<TaskFlowResponse> = { sessionActive, target: t.id };
  if (reply.kind === "open_form") { extra.route = t.formRoute; extra.prefill = reply.prefill; }
  if (reply.kind === "no_customers" && reply.createCustomerName !== undefined) {
    extra.route = "/sales/customers/new";
    extra.prefill = { name: reply.createCustomerName };
    extra.target = "customer";
  }
  if (reply.kind === "no_customers" && reply.createCustomerName === undefined) {
    extra.route = "/sales/customers/new";
    extra.target = "customer";
    extra.prefill = {};
  }
  return await respond(reply, extra);
}

export { wantsRegionalReply };
