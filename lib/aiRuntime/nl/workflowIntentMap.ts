/**
 * AI-NL's cheap, deterministic resolution layer (docs/ai/BRIEF-08b-FINAL.md B.1/B.2) — tried
 * BEFORE any LLM call. Every entry resolves an utterance to a real, registered workflow id and
 * the `eventKey` that workflow already answers to — never a second engine, never invented
 * behaviour. A utterance that doesn't match any pattern here falls through to the LLM layer
 * (`app/api/ai/command/route.ts`), constrained to the same registry.
 */

export interface WorkflowIntentEntry {
  id: string;
  patterns: RegExp[];
  workflowId: string;
  eventKey: string;
  /** Human-readable description, used both for "closest capabilities" suggestions and for the
   *  registry-match layer 2 (keyword scoring against workflow name/description/trigger vocabulary). */
  description: string;
  keywords: string[];
}

export const WORKFLOW_INTENT_MAP: WorkflowIntentEntry[] = [
  {
    id: "reconcile_bank",
    patterns: [/reconcile\s+(this\s+|the\s+)?bank/i, /bank\s+reconciliation/i],
    workflowId: "AI-22",
    eventKey: "ai.sweep.hourly",
    description: "Reconcile bank, AR/AP, tax, inventory and other control accounts against the GL",
    keywords: ["reconcile", "bank", "reconciliation", "control account", "tie out"],
  },
  {
    id: "explain_margin",
    patterns: [/why\s+is\s+(gross\s+)?margin\s+down/i, /margin\s+(movement|drop|decline)/i, /explain\s+(the\s+)?margin/i],
    workflowId: "AI-14",
    eventKey: "period.horizon.reached",
    description: "Explain period-over-period flux with named drivers",
    keywords: ["margin", "flux", "variance", "why did", "movement"],
  },
  {
    id: "prepare_accruals",
    patterns: [/prepare\s+.*accruals?/i, /accrue\s+/i, /run\s+accruals?/i],
    workflowId: "AI-07",
    eventKey: "ai.sweep.hourly",
    description: "Propose accrual entries and reversals",
    keywords: ["accrual", "accrue", "prepaid"],
  },
  {
    id: "close_blockers",
    patterns: [/what\s+blocks?\s+close/i, /close\s+readiness/i, /show\s+me\s+.*close/i],
    workflowId: "AI-13",
    eventKey: "ai.sweep.hourly",
    description: "Compute close readiness and rank blockers",
    keywords: ["close", "blocker", "readiness", "period close"],
  },
  {
    id: "fix_bank_matches",
    patterns: [/fix\s+.*bank\s+match/i, /auto.?match\s+bank/i, /match\s+the\s+bank/i],
    workflowId: "AI-03",
    eventKey: "ai.sweep.hourly",
    description: "Match bank statement lines to source documents, only where the autonomy gate allows",
    keywords: ["bank match", "auto-match", "fix matches"],
  },
  {
    id: "gst_workpaper",
    patterns: [/gst\s+workpaper/i, /prepare\s+.*(gst|tax)\s+workpaper/i, /tax\s+reconciliation/i],
    workflowId: "AI-12",
    eventKey: "period.horizon.reached",
    description: "Build the tax workpaper and reconcile ledger vs projected tax",
    keywords: ["gst", "tax workpaper", "tax reconciliation"],
  },
  {
    id: "find_duplicate_payments",
    patterns: [/duplicate\s+(vendor\s+)?payments?/i, /find\s+duplicates?/i, /paid\s+twice/i],
    workflowId: "AI-27",
    eventKey: "ai.sweep.hourly",
    description: "Find duplicate bills, expenses and payments across sources",
    keywords: ["duplicate", "paid twice", "double payment"],
  },
  {
    id: "ap_control_tie_out",
    patterns: [/why\s+doesn'?t\s+ap\s+tie/i, /ap\s+control\s+account/i, /ap\s+(doesn'?t|does\s+not)\s+tie/i],
    workflowId: "AI-22",
    eventKey: "ai.sweep.hourly",
    description: "Explain differences between the AP subledger and GL control account",
    keywords: ["ap control", "accounts payable", "tie to gl"],
  },
  {
    id: "show_support",
    patterns: [/show\s+me\s+the\s+support/i, /support\s+for\s+this\s+number/i, /evidence\s+for/i],
    workflowId: "AI-18",
    eventKey: "ai.sweep.hourly",
    description: "Build an evidence pack with citations for a reported figure",
    keywords: ["support", "evidence", "citation", "backup"],
  },
  {
    id: "collection_worklist",
    patterns: [/which\s+customers?\s+.*chase/i, /collection\s+worklist/i, /who\s+.*(follow\s*up|chase)/i],
    workflowId: "AI-05",
    eventKey: "ai.sweep.hourly",
    description: "Rank customers to chase for collection",
    keywords: ["collect", "chase", "overdue customer", "receivables"],
  },
  {
    id: "cash_shortfall",
    patterns: [/short\s+on\s+cash/i, /cash\s+(forecast|shortfall|risk)/i, /run\s+out\s+of\s+cash/i],
    workflowId: "AI-16",
    eventKey: "ai.sweep.hourly",
    description: "Forecast cash position and flag shortfall risk",
    keywords: ["cash", "forecast", "shortfall", "runway"],
  },
  {
    id: "explain_coding",
    patterns: [/why\s+did\s+.*code\s+this/i, /why\s+.*coded\s+to/i, /decision\s+trace/i],
    workflowId: "AI-18",
    eventKey: "ai.sweep.hourly",
    description: "Retrieve the decision trace behind a past automated action",
    keywords: ["why did the system", "decision trace", "explain this coding"],
  },
];

export function findClosestCapabilities(command: string, limit = 3): string[] {
  const words = command.toLowerCase().split(/\W+/).filter(Boolean);
  const scored = WORKFLOW_INTENT_MAP.map((entry) => {
    const score = entry.keywords.reduce((s, kw) => (words.some((w) => kw.toLowerCase().includes(w) || w.includes(kw.toLowerCase())) ? s + 1 : s), 0);
    return { entry, score };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => `${s.entry.workflowId}: ${s.entry.description}`);
}
