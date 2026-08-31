export interface NavFlowOutcome {
  handled: boolean;
  message?: string;
  route?: string;
}

// Broad, deliberately generous trigger for "move me to a screen" phrasing —
// shared with components/dashboard/AiSidebar.tsx so every AI Assistant
// surface (the global panel AND every per-module page) recognises the same
// set of phrasings. A false positive here is cheap and safe: the server-side
// classifier in /api/ai/command still decides the real intent (navigate vs.
// search vs. explain_report vs. unknown), and tryAiNavFlow only treats an
// actual "navigate" response as handled — anything else falls through to the
// caller's normal flow exactly as if this check had never fired.
export const NAV_TRIGGER_RX =
  /\b(redirect|take me|go to|goto|navigate|open (the|up)|show me|bring (me )?(up|to)|jump to|direct me|route me|send me to|get me to|pull up|switch to|i want to (go|see)|view the|display the|head to|move to)\b/i;

/**
 * Generic "AI navigation" pre-check — real, automatic redirection to the
 * right page for a natural-language destination ("redirect to incoming
 * receipts", "take me to the leads page", "open payroll"), covering every
 * feature across every module. Resolution is NOT a per-module lookup table —
 * it reuses /api/ai/command's "navigate" intent, which matches the phrase
 * against lib/ai/navRoutes.ts's NAV_DESTINATIONS (built directly from every
 * module's real sidebar config), so a page added to any sidebar is
 * automatically navigable by the AI with no extra wiring here.
 *
 * Call this AFTER tryAiCreateFlow (create-verb requests should still win)
 * and BEFORE falling back to the plain conversational assistant. Always
 * resolves to `{handled:false}` — never throws — so a network hiccup or an
 * "unknown"/"search"/"explain_report" classification never breaks the chat.
 */
export async function tryAiNavFlow(input: { text: string; pathname?: string }): Promise<NavFlowOutcome> {
  const q = input.text.trim();
  if (!q || !NAV_TRIGGER_RX.test(q)) return { handled: false };

  try {
    const res = await fetch("/api/ai/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: q,
        context: { pathname: input.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "") },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.action === "navigate" && data.url) {
      return { handled: true, message: data.message || "Opening that now.", route: data.url };
    }
    return { handled: false };
  } catch {
    return { handled: false };
  }
}
