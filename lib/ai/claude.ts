import { AzureOpenAI } from "openai";

// Lazy singleton — avoids initialisation errors when Azure OpenAI env vars
// are absent in environments that don't exercise AI routes (e.g. CI, build).
//
// Naming note (Phase 0 Azure OpenAI migration): this module still exports
// callClaude/callClaudeWithHistory/CLAUDE_DEFAULT_MODEL even though the
// provider underneath is now Azure OpenAI, not Anthropic Claude. Every
// existing call site (Finance/Sales/Inventory/HR/Manufacturing/Admin
// ai-assistant routes, and lib/ai/tenantAi.ts) imports these exact names —
// kept stable so this migration didn't require touching those call sites.
// A follow-up rename pass (file + exports) is a reasonable future cleanup
// but was treated as out of scope for the provider migration itself.
let _client: AzureOpenAI | null = null;
function getClient(): AzureOpenAI {
  if (!_client) {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    if (!apiKey || !endpoint || !apiVersion || !deployment) {
      throw new Error(
        "Azure OpenAI is not configured. Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, " +
          "AZURE_OPENAI_API_VERSION and AZURE_OPENAI_DEPLOYMENT_NAME in your .env file. " +
          "See SETUP_AI.md for how to obtain these from the Azure Portal / Azure AI Foundry."
      );
    }
    // No `deployment` passed to the client here, deliberately — that would
    // pin every call to one fixed deployment. Instead the deployment/model
    // name is resolved per call (see CLAUDE_DEFAULT_MODEL / opts.model
    // below) so tenant-specific model overrides (Organization.settings.ai.model)
    // keep working exactly as they did under the Anthropic client.
    _client = new AzureOpenAI({ apiKey, endpoint, apiVersion });
  }
  return _client;
}

/** Azure OpenAI deployment name used when no per-call/tenant override is given. */
export const CLAUDE_DEFAULT_MODEL = process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "";
export const CLAUDE_DEFAULT_MAX_TOKENS = 1024;

export interface ClaudeCallOptions {
  /** Azure OpenAI deployment name. Defaults to AZURE_OPENAI_DEPLOYMENT_NAME. */
  model?: string;
  /** Maximum tokens in the response. Defaults to 1024. */
  maxTokens?: number;
  /** Optional system-level instructions prepended to every call. */
  systemPrompt?: string;
}

/**
 * Call Azure OpenAI with a single user message and return the text response.
 *
 * All AI routes in this codebase should go through this function so that
 * model choice, error handling, and logging are in one place.
 */
export async function callClaude(
  userMessage: string,
  opts: ClaudeCallOptions = {}
): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: opts.model ?? CLAUDE_DEFAULT_MODEL,
    max_completion_tokens: opts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    messages: [
      ...(opts.systemPrompt
        ? [{ role: "system" as const, content: opts.systemPrompt }]
        : []),
      { role: "user" as const, content: userMessage },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Azure OpenAI returned no text content");
  }
  return text;
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

  const messages = [
    ...(opts.systemPrompt
      ? [{ role: "system" as const, content: opts.systemPrompt }]
      : []),
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: newUserMessage },
  ];

  const response = await client.chat.completions.create({
    model: opts.model ?? CLAUDE_DEFAULT_MODEL,
    max_completion_tokens: opts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    messages,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Azure OpenAI returned no text content");
  }
  return text;
}
