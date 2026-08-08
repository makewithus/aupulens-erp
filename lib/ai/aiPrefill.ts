/**
 * AI form pre-fill hand-off.
 *
 * The AI-native "do it for me" flow: the assistant extracts structured fields
 * (from a prompt and/or attached images), stashes them here, and navigates to
 * the real create page. That page reads the stash on mount, opens its own form
 * pre-filled, and shows any smart suggestions — then the USER verifies and
 * clicks Create. The AI does the typing; the human still approves the write.
 *
 * sessionStorage is used deliberately: it survives the client-side navigation
 * to the target page but is scoped to the tab and cleared once consumed, so a
 * stale draft can never silently resurface later.
 */
export interface AiPrefill {
  /** Entity/form key, e.g. "lead", "customer", "invoice". */
  target: string;
  /** Real route to navigate to (from the app's routes). */
  route: string;
  /** Field values to pre-fill (shape matches the target form). */
  data: Record<string, any>;
  /** Short, human data-quality tips ("Phone looks too short", …). */
  suggestions?: string[];
}

const KEY = "aupulens:ai-prefill";

export function stashPrefill(p: AiPrefill): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable — the target page just opens an empty form */
  }
}

/**
 * Read and CLEAR the stashed prefill. Pass a `target` to only consume a stash
 * meant for this page (otherwise it's left in place). Returns null if none.
 */
export function consumePrefill(target?: string): AiPrefill | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiPrefill;
    if (target && parsed.target !== target) return null;
    sessionStorage.removeItem(KEY);
    return parsed && parsed.target ? parsed : null;
  } catch {
    return null;
  }
}
