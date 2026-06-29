import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoist mock factories so they exist before vi.mock() is hoisted ───────────
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  // Must be a real constructor (not an arrow fn) so `new Anthropic()` works
  function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }
  return { default: MockAnthropic };
});

import { callClaude, callClaudeWithHistory, CLAUDE_DEFAULT_MODEL } from "@/lib/ai/claude";

const TEXT_RESPONSE = "This is Claude's response.";

function makeAnthropicResponse(text: string) {
  return {
    content: [{ type: "text", text }],
    model: CLAUDE_DEFAULT_MODEL,
    stop_reason: "end_turn",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key-abc";
  mockCreate.mockResolvedValue(makeAnthropicResponse(TEXT_RESPONSE));
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  // Reset the lazy singleton so tests stay isolated
  vi.resetModules();
});

describe("callClaude", () => {
  it("returns the text from the first text content block", async () => {
    const result = await callClaude("Hello Claude");
    expect(result).toBe(TEXT_RESPONSE);
  });

  it("calls the API with the default model when none is specified", async () => {
    await callClaude("Hello");
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe(CLAUDE_DEFAULT_MODEL);
  });

  it("respects a custom model override", async () => {
    await callClaude("Hello", { model: "claude-opus-4-8" });
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-8");
  });

  it("respects a custom maxTokens override", async () => {
    await callClaude("Hello", { maxTokens: 2048 });
    const call = mockCreate.mock.calls[0][0];
    expect(call.max_tokens).toBe(2048);
  });

  it("includes system prompt when provided", async () => {
    await callClaude("Hello", { systemPrompt: "You are a finance expert." });
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toBe("You are a finance expert.");
  });

  it("omits system key when no systemPrompt is provided", async () => {
    await callClaude("Hello");
    const call = mockCreate.mock.calls[0][0];
    expect(call).not.toHaveProperty("system");
  });

  it("sends the user message as the last message in the messages array", async () => {
    await callClaude("My question");
    const call = mockCreate.mock.calls[0][0];
    const lastMsg = call.messages[call.messages.length - 1];
    expect(lastMsg).toEqual({ role: "user", content: "My question" });
  });

  it("throws when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    // Reset module-level singleton so missing key is detected
    vi.resetModules();
    const { callClaude: freshCallClaude } = await import("@/lib/ai/claude");
    await expect(freshCallClaude("Hello")).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  it("throws when the API returns no text content block", async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });
    await expect(callClaude("Hello")).rejects.toThrow("no text content");
  });
});

describe("callClaudeWithHistory", () => {
  it("prepends history turns before the new user message", async () => {
    const history = [
      { role: "user" as const, content: "Turn 1" },
      { role: "assistant" as const, content: "Response 1" },
    ];
    await callClaudeWithHistory(history, "Turn 2");

    const call = mockCreate.mock.calls[0][0];
    expect(call.messages).toHaveLength(3);
    expect(call.messages[0]).toEqual({ role: "user", content: "Turn 1" });
    expect(call.messages[1]).toEqual({ role: "assistant", content: "Response 1" });
    expect(call.messages[2]).toEqual({ role: "user", content: "Turn 2" });
  });

  it("works with empty history (single-turn call)", async () => {
    await callClaudeWithHistory([], "First message");
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0]).toEqual({ role: "user", content: "First message" });
  });

  it("returns the assistant text response", async () => {
    const result = await callClaudeWithHistory([], "Hello");
    expect(result).toBe(TEXT_RESPONSE);
  });
});
