import connectDB from "@/lib/db";
import AiMemory from "@/models/ai/AiMemory";

/**
 * AI-NL's conversational memory (Chunk 9, Part D — docs/ai/BRIEF-09-VERIFICATION.md). Extends the
 * existing `AiMemory` model (scope `"ai_nl_session"`, never a new collection — Part A.3) rather
 * than building a third store. One document per conversation: `key = "<userId>:<conversationId>"`
 * — the userId is embedded in the key itself, not just implied by scope/tenant, so a session can
 * never be loaded, resolved against, or listed for any user other than the one who created it,
 * even if a caller only had the conversationId (Part D.4: "no cross-tenant/user state").
 *
 * What's remembered (D.1): recent turns, the last workflow run's own result set (record ids +
 * labels — the critical one: reference resolution always resolves an id already in this list,
 * never a freshly-invented one), current focus, a pending clarification question, a pending
 * confirm-gated proposal, and any modifiers the user has explicitly applied this session (e.g.
 * "only overdue ones"). Bounded and expiring (D.4): at most `MAX_TURNS` turns are kept, and a
 * session older than `SESSION_TTL_MS` is treated as expired and never resolved against — read as
 * fresh/empty rather than served stale. `AiMemory` itself carries no TTL index (it also holds
 * unrelated, non-expiring tenant memories — a blanket TTL would silently delete those), so
 * expiry here is enforced in application code on every read, which is sufficient: an expired
 * session is inert, never returned to a caller, and gets overwritten the next time this
 * conversationId is used.
 */

const MAX_TURNS = 20;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours of inactivity — must expire, D.4

export interface AiNlTurn {
  role: "user" | "assistant";
  text: string;
  at: string; // ISO
}

export interface AiNlResultItem {
  /** The real Mongo _id (or workflow runId) — the ONLY thing a later reference may resolve to. */
  id: string;
  model: string;
  label: string;
}

export interface AiNlResultSet {
  workflowId: string;
  runId?: string;
  items: AiNlResultItem[];
  asOf: string; // ISO
}

export interface AiNlPendingClarification {
  question: string;
  /** What the clarification would complete, if answered — re-applied verbatim once resolved. */
  forWorkflowId: string;
  forEventKey: string;
  forParameters: Record<string, unknown>;
  askedAt: string;
}

export interface AiNlPendingProposal {
  proposalId: string;
  workflowId: string;
  summary: string;
  createdAt: string;
}

export interface AiNlSessionState {
  tenantId: string;
  userId: string;
  conversationId: string;
  turns: AiNlTurn[];
  resultSet?: AiNlResultSet;
  currentFocus?: AiNlResultItem;
  pendingClarification?: AiNlPendingClarification;
  pendingProposal?: AiNlPendingProposal;
  appliedModifiers?: Record<string, unknown>;
  lastCorrection?: { field: string; from: unknown; to: unknown; at: string };
  updatedAt: string; // ISO
}

function memoryKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

function emptySession(tenantId: string, userId: string, conversationId: string): AiNlSessionState {
  return { tenantId, userId, conversationId, turns: [], updatedAt: new Date(0).toISOString() };
}

/** Loads a conversation's session state — returns a fresh, empty session (never throws, never
 *  returns another user's state) if none exists yet or the stored one has expired. */
export async function loadSession(tenantId: string, userId: string, conversationId: string): Promise<AiNlSessionState> {
  await connectDB();
  const doc = await AiMemory.findOne({ tenantId, scope: "ai_nl_session", key: memoryKey(userId, conversationId) }).lean();
  if (!doc) return emptySession(tenantId, userId, conversationId);

  let state: AiNlSessionState;
  try {
    state = JSON.parse(doc.value) as AiNlSessionState;
  } catch {
    return emptySession(tenantId, userId, conversationId);
  }

  // Defense in depth: even though key/scope/tenantId already scope this to one user, refuse to
  // resolve against a payload whose own recorded userId/tenantId disagree with the caller's.
  if (state.tenantId !== tenantId || state.userId !== userId) return emptySession(tenantId, userId, conversationId);

  const age = Date.now() - new Date(state.updatedAt || 0).getTime();
  if (!Number.isFinite(age) || age > SESSION_TTL_MS) return emptySession(tenantId, userId, conversationId);

  return state;
}

export async function saveSession(state: AiNlSessionState): Promise<void> {
  await connectDB();
  const bounded: AiNlSessionState = { ...state, turns: state.turns.slice(-MAX_TURNS), updatedAt: new Date().toISOString() };
  await AiMemory.findOneAndUpdate(
    { tenantId: state.tenantId, scope: "ai_nl_session", key: memoryKey(state.userId, state.conversationId) },
    { $set: { tenantId: state.tenantId, scope: "ai_nl_session", key: memoryKey(state.userId, state.conversationId), value: JSON.stringify(bounded) } },
    { upsert: true },
  );
}

export function recordTurn(state: AiNlSessionState, role: "user" | "assistant", text: string): AiNlSessionState {
  return { ...state, turns: [...state.turns, { role, text, at: new Date().toISOString() }] };
}

/** Called after a workflow run/preview produces citations — this is THE list any later "the
 *  second one"/"that one"/"the one from Acme" reference is allowed to resolve against. Replaces
 *  any prior result set (only the most recent one is ever remembered — D.1's "current focus"). */
export function rememberResultSet(state: AiNlSessionState, workflowId: string, items: AiNlResultItem[], runId?: string): AiNlSessionState {
  return { ...state, resultSet: { workflowId, runId, items, asOf: new Date().toISOString() }, currentFocus: items.length === 1 ? items[0] : state.currentFocus };
}

export function clearPending(state: AiNlSessionState): AiNlSessionState {
  return clearProposal(clearClarification(state));
}

export function clearClarification(state: AiNlSessionState): AiNlSessionState {
  const rest = { ...state };
  delete rest.pendingClarification;
  return rest;
}

export function clearProposal(state: AiNlSessionState): AiNlSessionState {
  const rest = { ...state };
  delete rest.pendingProposal;
  return rest;
}
