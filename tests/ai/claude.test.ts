import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoist mock factories so they exist before vi.mock() is hoisted ───────────
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("openai", () => {
  // Must be a real constructor (not an arrow fn) so `new AzureOpenAI()` works
  function AzureOpenAI() {
    return { chat: { completions: { create: mockCreate } } };
  }
  return { AzureOpenAI };
});

const TEXT_RESPONSE = "This is the assistant's response.";

function makeAzureResponse(text: string | null) {
  return {
    choices: [{ message: { role: "assistant", content: text } }],
  };
}

const ENV_KEYS = [
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_VERSION",
  "AZURE_OPENAI_DEPLOYMENT_NAME",
] as const;

function setValidEnv() {
  process.env.AZURE_OPENAI_API_KEY = "test-key-abc";
  process.env.AZURE_OPENAI_ENDPOINT = "https://test-resource.openai.azure.com";
  process.env.AZURE_OPENAI_API_VERSION = "2024-10-21";
  process.env.AZURE_OPENAI_DEPLOYMENT_NAME = "test-deployment";
}

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

// CLAUDE_DEFAULT_MODEL is computed once at module-import time from
// AZURE_OPENAI_DEPLOYMENT_NAME (deployment names have no sensible universal
// default, unlike Anthropic's public model IDs), so every test re-imports a
// fresh module instance after setting env — same pattern the pre-migration
// test used for its lazy client singleton.
async function freshClaudeModule() {
  vi.resetModules();
  return import("@/lib/ai/claude");
}

beforeEach(() => {
  vi.clearAllMocks();
  setValidEnv();
  mockCreate.mockResolvedValue(makeAzureResponse(TEXT_RESPONSE));
});

afterEach(() => {
  clearEnv();
  vi.resetModules();
});

describe("callClaude", () => {
  it("returns the text from the first choice's message content", async () => {
    const { callClaude } = await freshClaudeModule();
    const result = await callClaude("Hello");
    expect(result).toBe(TEXT_RESPONSE);
  });

  it("calls the API with the default model (Azure deployment name) when none is specified", async () => {
    const { callClaude, CLAUDE_DEFAULT_MODEL } = await freshClaudeModule();
    expect(CLAUDE_DEFAULT_MODEL).toBe("test-deployment");
    await callClaude("Hello");
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe("test-deployment");
  });

  it("respects a custom model override", async () => {
    const { callClaude } = await freshClaudeModule();
    await callClaude("Hello", { model: "custom-deployment" });
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe("custom-deployment");
  });

  it("respects a custom maxTokens override", async () => {
    const { callClaude } = await freshClaudeModule();
    await callClaude("Hello", { maxTokens: 2048 });
    const call = mockCreate.mock.calls[0][0];
    expect(call.max_completion_tokens).toBe(2048);
  });

  it("includes a system message first when systemPrompt is provided", async () => {
    const { callClaude } = await freshClaudeModule();
    await callClaude("Hello", { systemPrompt: "You are a finance expert." });
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages[0]).toEqual({
      role: "system",
      content: "You are a finance expert.",
    });
  });

  it("omits any system message when no systemPrompt is provided", async () => {
    const { callClaude } = await freshClaudeModule();
    await callClaude("Hello");
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages.some((m: { role: string }) => m.role === "system")).toBe(false);
  });

  it("sends the user message as the last message in the messages array", async () => {
    const { callClaude } = await freshClaudeModule();
    await callClaude("My question");
    const call = mockCreate.mock.calls[0][0];
    const lastMsg = call.messages[call.messages.length - 1];
    expect(lastMsg).toEqual({ role: "user", content: "My question" });
  });

  it("throws when Azure OpenAI env vars are missing", async () => {
    clearEnv();
    const { callClaude } = await freshClaudeModule();
    await expect(callClaude("Hello")).rejects.toThrow("Azure OpenAI is not configured");
  });

  it("throws when the API returns no text content", async () => {
    const { callClaude } = await freshClaudeModule();
    mockCreate.mockResolvedValueOnce(makeAzureResponse(null));
    await expect(callClaude("Hello")).rejects.toThrow("no text content");
  });
});

describe("callClaudeWithHistory", () => {
  it("prepends history turns before the new user message", async () => {
    const { callClaudeWithHistory } = await freshClaudeModule();
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
    const { callClaudeWithHistory } = await freshClaudeModule();
    await callClaudeWithHistory([], "First message");
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0]).toEqual({ role: "user", content: "First message" });
  });

  it("returns the assistant text response", async () => {
    const { callClaudeWithHistory } = await freshClaudeModule();
    const result = await callClaudeWithHistory([], "Hello");
    expect(result).toBe(TEXT_RESPONSE);
  });
});
