import Anthropic from "@anthropic-ai/sdk";

// Lazy singleton — avoids initialisation errors when ANTHROPIC_API_KEY is
// absent in environments that don't exercise AI routes (e.g. CI, build).
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file."
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-6";
export const CLAUDE_DEFAULT_MAX_TOKENS = 1024;

export interface ClaudeCallOptions {
  /** Anthropic model ID. Defaults to claude-sonnet-4-6. */
  model?: string;
  /** Maximum tokens in the response. Defaults to 1024. */
  maxTokens?: number;
  /** Optional system-level instructions prepended to every call. */
  systemPrompt?: string;
}

/**
 * Call the Claude API with a single user message and return the text response.
 *
 * All AI routes in this codebase should go through this function so that
 * model choice, error handling, and logging are in one place.
 */
export async function callClaude(
  userMessage: string,
  opts: ClaudeCallOptions = {}
): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: opts.model ?? CLAUDE_DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return textBlock.text;
}

/**
 * Build a multi-turn messages array from a flat history array plus a new
 * user message. Used by routes that restore prior conversation turns.
 */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function callClaudeWithHistory(
  history: ChatTurn[],
  newUserMessage: string,
  opts: ClaudeCallOptions = {}
): Promise<string> {
  const client = getClient();

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: newUserMessage },
  ];

  const response = await client.messages.create({
    model: opts.model ?? CLAUDE_DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return textBlock.text;
}
