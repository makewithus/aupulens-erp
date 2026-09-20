import { detectLanguage } from "@/lib/ai/language/detect";
import { stashPrefill } from "@/lib/ai/aiPrefill";
import { QUERY_RX } from "@/lib/ai/taskFlow/parse";

/**
 * Client half of the guided task flow (lib/ai/taskFlow/*). Called from tryAiCreateFlow FIRST, so all
 * eight assistant surfaces get it with no UI change: each turn is just a normal assistant message.
 *
 * Zero cost for the majority path: an English message that doesn't mention an invoice never leaves
 * the browser here. Regional-language text is sent so the server can translate it — the classifier
 * then works on the pipeline's English, and that English is handed back (`english`) so the existing
 * create-form router can classify regional input too.
 */
export interface TaskFlowOutcome { handled: true; message: string; route?: string; choices?: string[]; actions?: { label: string; value: string }[] }

const ACTIVE_KEY = "aupulens:task-flow-active";
const setActive = (on: boolean) => { try { if (on) sessionStorage.setItem(ACTIVE_KEY, "1"); else sessionStorage.removeItem(ACTIVE_KEY); } catch { /* storage unavailable */ } };
const isActive = () => { try { return sessionStorage.getItem(ACTIVE_KEY) === "1"; } catch { return false; } };

export function shouldConsultTaskFlow(text: string, hasAttachments: boolean): boolean {
  if (hasAttachments || !text.trim() || text.length > 600) return false; // documents keep the existing extraction path
  if (isActive()) return true;
  const kind = detectLanguage(text).kind;
  // English stays local unless it is about an invoice/bill AND reads like a create/explain request (or is a bare
  // "invoice for Acme 45k"). "show unpaid invoices" / "how many bills" never pay for a round trip.
  if (kind === "english" || kind === "none") {
    if (!/\b(?:inv[a-z]{2,6}|bills?)\b/i.test(text)) return false;
    const cue = /\b(?:create|creating|make|making|generate|draft|prepare|prep|raise|issue|write|cut|new|add|need|want|require|give|pls|plz|please|kindly|how (?:do|can|to|should|would)|steps?|explain|guide|can i|could i|help)\b/i;
    return cue.test(text) || (!QUERY_RX.test(text) && (/\d/.test(text) || /\bfor\b/i.test(text)));
  }
  return kind !== "unsupported";
}

export async function runTaskFlow(
  text: string,
  opts: { hasAttachments?: boolean; fetchFn?: typeof fetch } = {},
): Promise<{ outcome: TaskFlowOutcome | null; english?: string }> {
  if (!shouldConsultTaskFlow(text, !!opts.hasAttachments)) return { outcome: null };
  try {
    const res = await (opts.fetchFn ?? fetch)("/api/ai/task-flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, expectSession: isActive() }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return { outcome: null };
    setActive(!!data.sessionActive);
    const english: string | undefined = typeof data.english === "string" && data.english ? data.english : undefined;
    if (!data.handled) return { outcome: null, english };
    if (data.route && data.prefill && data.target) {
      stashPrefill({ target: data.target, route: data.route, data: data.prefill, suggestions: [] });
    }
    return { outcome: { handled: true, message: String(data.message ?? ""), route: data.route, choices: data.choices, actions: data.actions }, english };
  } catch {
    return { outcome: null }; // fail open: the normal assistant answers
  }
}
