export const CLAUDE_DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
export const CLAUDE_DEFAULT_MAX_TOKENS = 1000;
export type ChatTurn = { role: string; content: string };
export type ClaudeCallOptions = { systemPrompt?: string; temperature?: number; model?: string; maxTokens?: number };
export async function callClaude(prompt: string, options?: ClaudeCallOptions): Promise<string> {
  return "Mocked Claude Response";
}
export async function callClaudeWithHistory(history: ChatTurn[], userMessage: string, options?: ClaudeCallOptions): Promise<string> {
  return "Mocked Claude Response";
}
