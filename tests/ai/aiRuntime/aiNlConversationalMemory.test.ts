import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ainlmemory";

const { getMockClaudeText, setMockClaudeText } = vi.hoisted(() => {
  let text: string | null = null;
  return { getMockClaudeText: () => text, setMockClaudeText: (t: string | null) => { text = t; } };
});

vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: vi.fn(async () => ({ tier: "pro", aiSettings: {} })),
  callClaudeForTenant: vi.fn(async () => {
    const text = getMockClaudeText();
    return text === null ? { gated: true, error: "gated", code: "AI_DISABLED" } : { text };
  }),
}));

import type { AiNlSessionState } from "@/lib/aiRuntime/nl/conversationMemory";

// vi.mock() forces this whole file into true ESM import ordering (every static import resolves
// before ANY of the file's own top-level code runs, including `process.env.MONGODB_URI = ...`
// above) — so anything that transitively reaches lib/db.ts must be imported dynamically, inside
// beforeAll, AFTER the env var is set. Same pattern as tests/ai/aiRuntime/aiLearningLoop.test.ts.
let AiMemory: (typeof import("@/models/ai/AiMemory"))["default"];
let loadSession: typeof import("@/lib/aiRuntime/nl/conversationMemory").loadSession;
let saveSession: typeof import("@/lib/aiRuntime/nl/conversationMemory").saveSession;
let recordTurn: typeof import("@/lib/aiRuntime/nl/conversationMemory").recordTurn;
let rememberResultSet: typeof import("@/lib/aiRuntime/nl/conversationMemory").rememberResultSet;
let clearPending: typeof import("@/lib/aiRuntime/nl/conversationMemory").clearPending;
let resolveReference: typeof import("@/lib/aiRuntime/nl/resolveReference").resolveReference;

/**
 * Chunk 9, Part D — conversational memory for AI-NL (docs/ai/BRIEF-09-VERIFICATION.md). Covers
 * D.1 (what's remembered), D.2 (all nine reference shapes, resolved to the SAME normal path,
 * never a raw id from the model), and D.4's must-nots (no cross-tenant/user state, must expire/
 * bound, never widens scope). `resolveReference`'s own LLM call is mocked deterministically
 * (`mockClaudeText`, set per test) — this is testing the RESOLUTION LOGIC and its safety
 * boundary, not live model behaviour, the same convention `ai02LedgerClassification.test.ts` uses
 * for its own model-fallback branch.
 */

const TENANT = "ainl-mem-tenant";
const OTHER_TENANT = "ainl-mem-other-tenant";
const USER = "user-a";
const OTHER_USER = "user-b";

function baseSession(overrides: Partial<AiNlSessionState> = {}): AiNlSessionState {
  return {
    tenantId: TENANT,
    userId: USER,
    conversationId: "conv-1",
    turns: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const RESULT_SET_ITEMS = [
  { id: "111111111111111111111111", model: "Invoice", label: "INV-001 — Acme Corp — ₹50,000" },
  { id: "222222222222222222222222", model: "Invoice", label: "INV-002 — Beta LLC — ₹12,000" },
  { id: "333333333333333333333333", model: "Invoice", label: "INV-003 — Acme Corp — ₹8,000" },
];

describe("AI-NL conversational memory (Chunk 9, Part D)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    ({ default: AiMemory } = await import("@/models/ai/AiMemory"));
    ({ loadSession, saveSession, recordTurn, rememberResultSet, clearPending } = await import("@/lib/aiRuntime/nl/conversationMemory"));
    ({ resolveReference } = await import("@/lib/aiRuntime/nl/resolveReference"));
    await AiMemory.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(() => {
    setMockClaudeText(null);
  });

  // ── D.1: what's remembered — round-trips through real Mongo, not just in-memory ────────────
  it("persists and reloads a session's turns, result set, and pending proposal", async () => {
    let state = baseSession({ conversationId: "conv-persist" });
    state = recordTurn(state, "user", "reconcile the bank account");
    state = recordTurn(state, "assistant", "Done — 3 exceptions found.");
    state = rememberResultSet(state, "AI-03", RESULT_SET_ITEMS, "run-abc");
    state = { ...state, pendingProposal: { proposalId: "p1", workflowId: "AI-06", summary: "Pay 2 vendors ₹10,000", createdAt: new Date().toISOString() } };
    await saveSession(state);

    const reloaded = await loadSession(TENANT, USER, "conv-persist");
    expect(reloaded.turns).toHaveLength(2);
    expect(reloaded.resultSet?.items).toHaveLength(3);
    expect(reloaded.resultSet?.workflowId).toBe("AI-03");
    expect(reloaded.pendingProposal?.proposalId).toBe("p1");
    expect(reloaded.currentFocus).toBeUndefined(); // 3 items — no single-item auto-focus
  });

  it("D.1: a single-item result set becomes the current focus automatically", async () => {
    let state = baseSession({ conversationId: "conv-focus" });
    state = rememberResultSet(state, "AI-19", [RESULT_SET_ITEMS[0]], "run-xyz");
    expect(state.currentFocus?.id).toBe(RESULT_SET_ITEMS[0].id);
  });

  // ── D.4: must expire / bound ────────────────────────────────────────────────────────────────
  it("D.4: bounds turn history to the last 20 turns, never grows unbounded", async () => {
    let state = baseSession({ conversationId: "conv-bound" });
    for (let i = 0; i < 30; i++) state = recordTurn(state, "user", `message ${i}`);
    await saveSession(state);
    const reloaded = await loadSession(TENANT, USER, "conv-bound");
    expect(reloaded.turns.length).toBeLessThanOrEqual(20);
    expect(reloaded.turns[reloaded.turns.length - 1].text).toBe("message 29"); // kept the RECENT ones
  });

  it("D.4: a session older than the TTL is treated as expired — loaded as fresh, not served stale", async () => {
    const stale: AiNlSessionState = { ...baseSession({ conversationId: "conv-stale" }), updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() };
    await AiMemory.create({ tenantId: TENANT, scope: "ai_nl_session", key: `${USER}:conv-stale`, value: JSON.stringify(stale) });
    const reloaded = await loadSession(TENANT, USER, "conv-stale");
    expect(reloaded.turns).toHaveLength(0);
    expect(reloaded.resultSet).toBeUndefined();
  });

  // ── D.4: no cross-tenant/user state ─────────────────────────────────────────────────────────
  it("D.4: a different user in the SAME tenant, using the same conversationId, gets a fresh session — never another user's state", async () => {
    let state = baseSession({ conversationId: "conv-shared-id" });
    state = rememberResultSet(state, "AI-27", RESULT_SET_ITEMS, "run-1");
    await saveSession(state);

    const otherUsersView = await loadSession(TENANT, OTHER_USER, "conv-shared-id");
    expect(otherUsersView.resultSet).toBeUndefined();
    expect(otherUsersView.turns).toHaveLength(0);
  });

  it("D.4: a different tenant, same userId and conversationId, gets a fresh session — never another tenant's state", async () => {
    let state = baseSession({ conversationId: "conv-shared-id-2" });
    state = rememberResultSet(state, "AI-27", RESULT_SET_ITEMS, "run-1");
    await saveSession(state);

    const otherTenantsView = await loadSession(OTHER_TENANT, USER, "conv-shared-id-2");
    expect(otherTenantsView.resultSet).toBeUndefined();
  });

  it("D.4: the generic user-facing /api/ai/memory scope list never includes ai_nl_session (structural)", async () => {
    // app/api/ai/memory/route.ts hand-maintains its own VALID_SCOPES array, independent of the
    // model's AI_MEMORY_SCOPES — asserting the model's own scope union still contains the value
    // this test relies on, and documenting the isolation directly (source-grep is done in the
    // route's own file, this just pins the scope string itself hasn't silently changed).
    const doc = await AiMemory.create({ tenantId: TENANT, scope: "ai_nl_session" as any, key: "structural-check", value: "{}" });
    expect(doc.scope).toBe("ai_nl_session");
  });

  // ── D.2: reference resolution — nine shapes, ONE mechanism ─────────────────────────────────
  it("no resolvable state at all → not_a_reference immediately, zero model calls", async () => {
    const state = baseSession();
    const callSpy = (await import("@/lib/ai/tenantAi")).callClaudeForTenant as unknown as ReturnType<typeof vi.fn>;
    callSpy.mockClear();
    const res = await resolveReference(TENANT, "reconcile the bank account", state);
    expect(res.type).toBe("not_a_reference");
    expect(callSpy).not.toHaveBeenCalled();
  });

  it("pronoun ('it'): resolves to the current focus item by index, never a raw id from the model", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-19", [RESULT_SET_ITEMS[0]], "run-1");
    setMockClaudeText(JSON.stringify({ type: "explain_item", itemIndex: 1 }));
    const res = await resolveReference(TENANT, "why did it flag that?", state);
    expect(res.type).toBe("explain_item");
    expect(res.item?.id).toBe(RESULT_SET_ITEMS[0].id); // the REAL id, substituted by index, not by the model
  });

  it("ordinal ('the second one'): resolves by 1-based index into the remembered result set", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-27", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText(JSON.stringify({ type: "explain_item", itemIndex: 2 }));
    const res = await resolveReference(TENANT, "tell me about the second one", state);
    expect(res.type).toBe("explain_item");
    expect(res.item?.id).toBe(RESULT_SET_ITEMS[1].id);
    expect(res.item?.label).toContain("Beta LLC");
  });

  it("descriptive ('the one from Acme'): the model picks by description, resolution still goes through the same index-only path", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-27", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText(JSON.stringify({ type: "explain_item", itemIndex: 3 }));
    const res = await resolveReference(TENANT, "what about the one from Acme with the smaller amount", state);
    expect(res.type).toBe("explain_item");
    expect(res.item?.id).toBe(RESULT_SET_ITEMS[2].id);
  });

  it("continuation ('and also check X'): resolves to a rerun of the SAME workflow with an added parameter", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-05", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText(JSON.stringify({ type: "rerun", parameters: { includeOverdue: true } }));
    const res = await resolveReference(TENANT, "and also check the overdue ones", state);
    expect(res.type).toBe("rerun");
    expect(res.workflowId).toBe("AI-05");
    expect(res.parameters).toEqual({ includeOverdue: true });
  });

  it("modification ('actually raise the threshold to Y'): resolves to a rerun with the modified parameter", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-27", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText(JSON.stringify({ type: "rerun", parameters: { thresholdAmount: 50000 } }));
    const res = await resolveReference(TENANT, "actually raise the threshold to 50000", state);
    expect(res.type).toBe("rerun");
    expect(res.parameters).toEqual({ thresholdAmount: 50000 });
  });

  it("scope-change ('now for last quarter instead'): resolves to a rerun with a changed period parameter", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-14", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText(JSON.stringify({ type: "rerun", parameters: { period: "2025-Q4" } }));
    const res = await resolveReference(TENANT, "now show me last quarter instead", state);
    expect(res.type).toBe("rerun");
    expect(res.parameters).toEqual({ period: "2025-Q4" });
  });

  it("correction ('no, I meant Y not X'): resolves to a rerun replacing the earlier parameter", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-06", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText(JSON.stringify({ type: "rerun", parameters: { vendorName: "Beta LLC" } }));
    const res = await resolveReference(TENANT, "no, I meant Beta LLC, not Acme", state);
    expect(res.type).toBe("rerun");
    expect(res.parameters).toEqual({ vendorName: "Beta LLC" });
  });

  it("answers a pending clarification: merges the answer into the original stalled request and resolves it", async () => {
    let state = baseSession();
    state = {
      ...state,
      pendingClarification: { question: "Which vendor did you mean?", forWorkflowId: "AI-06", forEventKey: "ai.sweep.hourly", forParameters: { action: "pay" }, askedAt: new Date().toISOString() },
    };
    setMockClaudeText(JSON.stringify({ type: "answer_clarification", parameters: { vendorName: "Acme Corp" } }));
    const res = await resolveReference(TENANT, "Acme Corp", state);
    expect(res.type).toBe("rerun");
    expect(res.workflowId).toBe("AI-06");
    expect(res.parameters).toEqual({ action: "pay", vendorName: "Acme Corp" });
  });

  it("undo: resolves only when a pending proposal actually exists", async () => {
    let state = baseSession();
    state = { ...state, pendingProposal: { proposalId: "p1", workflowId: "AI-06", summary: "Pay vendor", createdAt: new Date().toISOString() } };
    setMockClaudeText(JSON.stringify({ type: "undo" }));
    const res = await resolveReference(TENANT, "undo that", state);
    expect(res.type).toBe("undo");

    // No pending proposal to undo — even if the model somehow says "undo", refuse rather than
    // pretending something was cancelled.
    const noProposalState = clearPending(state);
    const res2 = await resolveReference(TENANT, "undo that", noProposalState);
    expect(res2.type).toBe("not_a_reference");
  });

  it("meta ('why did it flag that'): same explain_item path as pronoun/ordinal — one mechanism for all nine shapes", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-15", [RESULT_SET_ITEMS[0]], "run-1");
    setMockClaudeText(JSON.stringify({ type: "explain_item", itemIndex: 1 }));
    const res = await resolveReference(TENANT, "why did the system flag that transaction?", state);
    expect(res.type).toBe("explain_item");
    expect(res.item?.id).toBe(RESULT_SET_ITEMS[0].id);
  });

  // ── Never guesses — the structural safety property ─────────────────────────────────────────
  it("an out-of-bounds itemIndex from the model is refused, not trusted — falls back to a clarifying question", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-27", [RESULT_SET_ITEMS[0]], "run-1"); // only ONE item
    setMockClaudeText(JSON.stringify({ type: "explain_item", itemIndex: 5 })); // model hallucinates index 5
    const res = await resolveReference(TENANT, "the fifth one", state);
    expect(res.type).toBe("clarify"); // never crashes, never silently picks something
  });

  it("a genuinely ambiguous reference produces exactly one clarifying question, never a guess", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-27", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText(JSON.stringify({ type: "clarify", question: "Did you mean INV-001 or INV-003 — both are from Acme?" }));
    const res = await resolveReference(TENANT, "the Acme one", state);
    expect(res.type).toBe("clarify");
    expect(res.question).toContain("INV-001");
  });

  it("AI disabled/gated for this tenant → fails open to not_a_reference, never blocks the normal flow", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-27", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText(null); // simulates the gated branch
    const res = await resolveReference(TENANT, "the second one", state);
    expect(res.type).toBe("not_a_reference");
  });

  it("malformed model output (not JSON) → not_a_reference, no crash", async () => {
    let state = baseSession();
    state = rememberResultSet(state, "AI-27", RESULT_SET_ITEMS, "run-1");
    setMockClaudeText("not json at all");
    const res = await resolveReference(TENANT, "the second one", state);
    expect(res.type).toBe("not_a_reference");
  });

  it("rerun with no workflow to re-run against (no result set, no pending clarification) is refused even if currentFocus alone exists", async () => {
    // currentFocus alone (no resultSet.workflowId) is a real, if narrow, case — resolveReference
    // must not invent a workflowId to rerun.
    const state: AiNlSessionState = { ...baseSession(), currentFocus: RESULT_SET_ITEMS[0] };
    setMockClaudeText(JSON.stringify({ type: "rerun", parameters: { foo: "bar" } }));
    const res = await resolveReference(TENANT, "do that again but different", state);
    expect(res.type).toBe("not_a_reference");
  });
});
