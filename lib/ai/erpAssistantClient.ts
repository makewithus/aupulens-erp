import type { ErpStructuredResponse } from "./erpTypes";

export type ErpReply = {
  usage?: { creditsUsed: 0; source: "erp" };
  handled: boolean;
  message?: string;
  conversationId?: string;
  chatId?: string;
  actions?: { label: string; value: string }[];
  structured?: ErpStructuredResponse;
};

/** No client transcript/results are accepted as authoritative ERP context. */
export async function runErpAssistant(input: { text: string; module: "sales" | "admin"; chatId?: string; conversationId?: string; requestId: string }): Promise<ErpReply> {
  try {
    const res = await fetch("/api/sales/ai-memory-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, authoritativeOnly: true }) });
    const body = await res.json();
    if (!res.ok) return { handled: true, message: body.message || body.error || "The record lookup is temporarily unavailable." };
    return body as ErpReply;
  } catch {
    return { handled: true, message: "I couldn't reach the assistant. Please check your connection and try again." };
  }
}
