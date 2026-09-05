import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_aicommandnlmemory";

/**
 * Route-level integration test for AI-NL's conversational memory (Chunk 9, Part D —
 * docs/ai/BRIEF-09-VERIFICATION.md), exercising the REAL `POST` handler in
 * `app/api/ai/command/route.ts` end to end across two turns — not just the underlying
 * `conversationMemory.ts`/`resolveReference.ts` units (covered directly in
 * `tests/ai/aiRuntime/aiNlConversationalMemory.test.ts`). This is specifically testing the
 * route's OWN new wiring: does a citation-bearing response actually get remembered as a result
 * set, does the conversationId round-trip to the client, does turn two's "the second one" (backed
 * by a mocked-but-realistic resolveReference call) actually resolve against what turn one stored.
 *
 * `handleWorkflowIntent` itself is mocked to a canned response — the underlying executor/workflow
 * behaviour is already covered by `tests/ai/aiRuntime/aiNl.test.ts` and the 30 workflows' own
 * verification suites; re-fixturing a real workflow run here would test the same thing twice
 * while adding noise to what this file is actually checking.
 */

const { getMockClaudeText, setMockClaudeText, mockHandleWorkflowIntent } = vi.hoisted(() => {
  let text: string | null = null;
  return {
    getMockClaudeText: () => text,
    setMockClaudeText: (t: string | null) => { text = t; },
    mockHandleWorkflowIntent: vi.fn(),
  };
});

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/aiRuntime/nl/workflowChatHandler", () => ({ handleWorkflowIntent: mockHandleWorkflowIntent }));
vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: vi.fn(async () => ({ tier: "pro", aiSettings: {} })),
  callClaudeForTenant: vi.fn(async () => {
    const text = getMockClaudeText();
    return text === null ? { gated: true, error: "gated", code: "AI_DISABLED" } : { text };
  }),
}));

import { auth } from "@/auth";

const TENANT = "ainl-route-tenant";
const USER_ID = new mongoose.Types.ObjectId().toString();
const URL = "http://localhost/api/ai/command";

function makeRequest(body: Record<string, unknown>) {
  return new Request(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as any;
}

function mockSession() {
  return { user: { id: USER_ID, tenantId: TENANT, role: "finance" } } as any;
}

let POST: typeof import("@/app/api/ai/command/route").POST;

describe("POST /api/ai/command — conversational memory wiring (Chunk 9, Part D)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    ({ POST } = await import("@/app/api/ai/command/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession());
    setMockClaudeText(null);
    mockHandleWorkflowIntent.mockReset();
  });

  it("turn 1: a citation-bearing workflow response is remembered as a result set, and a conversationId is minted and returned", async () => {
    mockHandleWorkflowIntent.mockResolvedValue({
      action: "explain",
      message: "3 exceptions found in the bank reconciliation.",
      workflowId: "AI-03",
      citations: [
        { kind: "BankStatementLine", ref: "111111111111111111111111", label: "TXN-001 — ₹5,000 unmatched" },
        { kind: "BankStatementLine", ref: "222222222222222222222222", label: "TXN-002 — ₹1,200 unmatched" },
      ],
    });

    const res = await POST(makeRequest({ command: "run AI-03" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.conversationId).toBeTruthy();
    expect(data.message).toContain("3 exceptions");

    // The result set must actually be persisted — read it back the same way the route does.
    const { loadSession } = await import("@/lib/aiRuntime/nl/conversationMemory");
    const session = await loadSession(TENANT, USER_ID, data.conversationId);
    expect(session.resultSet?.workflowId).toBe("AI-03");
    expect(session.resultSet?.items).toHaveLength(2);
    expect(session.resultSet?.items[0].id).toBe("111111111111111111111111");
    expect(session.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
  });

  it("turn 2: 'the second one', with the SAME conversationId, resolves against turn 1's remembered result set — never a fresh guess", async () => {
    mockHandleWorkflowIntent.mockResolvedValue({
      action: "explain",
      message: "Duplicate bills found.",
      workflowId: "AI-27",
      citations: [
        { kind: "Invoice", ref: "aaaaaaaaaaaaaaaaaaaaaaaa", label: "INV-100 — Acme Corp" },
        { kind: "Invoice", ref: "bbbbbbbbbbbbbbbbbbbbbbbb", label: "INV-101 — Beta LLC" },
      ],
    });
    const turn1 = await POST(makeRequest({ command: "run AI-27" }));
    const data1 = await turn1.json();
    const conversationId = data1.conversationId;

    setMockClaudeText(JSON.stringify({ type: "explain_item", itemIndex: 2 }));
    const turn2 = await POST(makeRequest({ command: "tell me more about the second one", conversationId }));
    const data2 = await turn2.json();

    expect(turn2.status).toBe(200);
    expect(data2.conversationId).toBe(conversationId); // same thread, not a new one
    // No decision-trace exists for the mocked runId in this test, so explainRememberedItem falls
    // back to its honest "no further detail recorded" message — the point being verified here is
    // that it resolved to the REAL remembered item (INV-101 / Beta LLC), not a hallucinated one.
    expect(data2.message).toContain("INV-101");
  });

  it("a fresh, unrelated command in a NEW conversation never resolves against another conversation's result set", async () => {
    mockHandleWorkflowIntent.mockResolvedValue({ action: "explain", message: "ok", workflowId: "AI-27", citations: [{ kind: "Invoice", ref: "cccccccccccccccccccccccc", label: "INV-999" }] });
    await POST(makeRequest({ command: "run AI-27" })); // conversation A, never reused below

    setMockClaudeText(JSON.stringify({ type: "explain_item", itemIndex: 1 })); // would resolve if state leaked
    const res = await POST(makeRequest({ command: "run AI-13" })); // a genuinely fresh conversation, no conversationId sent
    const data = await res.json();
    // A brand-new conversationId means no resolvable state, so resolveReference short-circuits and
    // this falls through to the normal cheap-match path for AI-13, not a reference resolution.
    expect(mockHandleWorkflowIntent).toHaveBeenLastCalledWith(TENANT, USER_ID, "AI-13", expect.any(String), expect.any(Object));
  });
});
