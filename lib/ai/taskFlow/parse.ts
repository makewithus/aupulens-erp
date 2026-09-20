import levenshtein from "js-levenshtein";
import { CREATE_VERB_RX } from "@/lib/ai/createTargets";
import { normaliseNumbers } from "@/lib/ai/language/numbers";

/** All functions here take NORMALISED ENGLISH (the pipeline's output), never raw input. */

/** "uncertain" = looks like it MIGHT be a create request but rules can't tell — the caller asks an LLM to classify. */
export type FlowIntent = "explain" | "do" | "ambiguous" | "uncertain" | "none";

const EXPLAIN_RX = /^\s*(?:please\s+)?(?:how\s+(?:do|can|should|would|to|does|is)\b|how\s+i\b|what(?:'s| is| are)\b|where\s+(?:do|can|is|are|to)\b|steps?\s+(?:to|for)\b|guide me\b|explain\b|tell me how\b|show me how\b|help me understand\b|walk me through\b)/i;
const QUESTION_MODAL_RX = /^\s*(?:can|could|may|should|do|does|is|am)\s+i\b|^\s*(?:is it possible|do i need|what if|why)\b/i;
const REQUEST_RX = /^\s*(?:please\s+)?(?:can|could|would|will)\s+you\b/i;

// Words that make a message a QUERY/OPERATION on existing invoices, not a request to create one.
export const QUERY_RX = /\b(?:show|list|view|open|find|search|look ?up|display|fetch|how many|how much|what|which|who|when|status|total|pending|overdue|unpaid|paid|outstanding|delete|remove|cancel|void|print|download|email|resend|reminder|export|report|summary|summarise|summarize|copy|duplicate|edit|update|reverse|send|share|forward|attach|mark|approve|reject|apply|record|remind)\b/i;
const DATA_QUERY_RX = /\b(?:total|pending|overdue|unpaid|paid|outstanding|status|summary|report|how many|how much|this (?:month|year|week|quarter)|last (?:month|year|week|quarter))\b/i;
const STRONG_CREATE_RX = /\b(?:create|make|generate|draft|prepare|prep|raise|issue|write|cut|new|add)\b/i;
const WEAK_CREATE_RX = /\b(?:need|want|require|give|pls|plz|please|kindly)\b/i;
const CREATE_CUE_RX = new RegExp(`${STRONG_CREATE_RX.source}|${WEAK_CREATE_RX.source}`, "i");
const VENDOR_RX = /\b(?:vendor|supplier|purchase|payable|payables|expense|reimburse\w*)\b/i;

/** Classify a message that mentions `nounRx` (or, if given, the ambiguous `weakNounRx`, e.g. "bill").
 *  Deterministic where it can be; "uncertain" hands the decision to an LLM rather than ignoring a clear instruction. */
export function classifyIntent(english: string, nounRx: RegExp, weakNounRx?: RegExp): FlowIntent {
  const q = english.trim();
  if (!q) return "none";
  const strong = nounRx.test(q);
  const weak = !strong && !!weakNounRx && weakNounRx.test(q) && !VENDOR_RX.test(q);
  if (!strong && !weak) return "none";
  if (EXPLAIN_RX.test(q)) return DATA_QUERY_RX.test(q) ? "none" : strong ? "explain" : "uncertain"; // "what is the total of my invoices" is a data question
  // "Creating an invoice" / "Making invoices" — a topic, not a request (unless it says for whom/what).
  if (/^\s*(?:creating|making|generating|drafting|raising|adding)\b/i.test(q) && !/\b(?:for|to|of)\s+\S/i.test(q)) return strong ? "ambiguous" : "uncertain";
  if (QUESTION_MODAL_RX.test(q)) return strong ? "ambiguous" : "uncertain"; // "Can I create an invoice without a customer?"
  if (weak) return !QUERY_RX.test(q) && (CREATE_CUE_RX.test(q) || /\d/.test(q)) ? "uncertain" : "none"; // "bill Kamal 2500 for repairs" // "raise a bill for Acme": sales invoice or vendor bill? ask the LLM
  // The verb must govern the noun ("create an invoice", "raise a new invoice for X") — not "add a note TO invoice 5".
  const nounSrc = (strong ? nounRx : weakNounRx!).source;
  const adjacent = new RegExp(`${STRONG_CREATE_RX.source}\\s+(?:(?!\\b(?:to|on|in|against|from|of)\\b)[\\w'-]+\\s+){0,3}(?:${nounSrc})`, "i").test(q);
  if (STRONG_CREATE_RX.test(q) && !adjacent && !WEAK_CREATE_RX.test(q)) return "none";
  const strongCue = adjacent;
  const weakCue = WEAK_CREATE_RX.test(q) && !QUERY_RX.test(q);
  if ((strongCue || weakCue) && (REQUEST_RX.test(q) || !/\?\s*$/.test(q))) return "do";
  if (/\?\s*$/.test(q) && (strongCue || weakCue)) return "ambiguous";
  if (/\b(?:creation|process|procedure|steps|format|template)\b/i.test(q)) return "ambiguous";
  // Noun with no verb: "invoice for Acme 45k", "acme invoice" — a request or a lookup? Query words ⇒ not ours.
  if (QUERY_RX.test(q)) return "none";
  return q.split(/\s+/).length >= 2 ? "uncertain" : "none";
}

export type Control = "open_form" | "cancel" | "back" | "skip" | "skip_rest" | "confirm" | "deny" | "resume" | "restart";
export function parseControl(english: string): Control | null {
  const s = english.trim().toLowerCase().replace(/[.!]+$/, "");
  // Escape hatch (offered at every question): today's behaviour — a partly pre-filled form.
  if (/^(?:(?:please\s+)?(?:just\s+)?(?:skip (?:the )?questions?(?: and)?(?: just)? (?:open|show) (?:the )?form|(?:just )?open (?:the )?(?:invoice )?form(?: now)?|skip questions|open form))$/.test(s)) return "open_form";
  if (/^(?:cancel|stop|abort|quit|exit|never ?mind|forget it|discard|cancel (?:it|this|the (?:invoice|task)))$/.test(s)) return "cancel";
  if (/^(?:back|go back|previous|undo|previous question|one step back)$/.test(s)) return "back";
  if (/^(?:skip|pass|skip (?:this|it)|not needed|no due date|leave (?:it )?blank|none)$/.test(s)) return "skip";
  if (/^(?:skip (?:the )?rest|skip all|that'?s all|that is all|no more|nothing else|done|finish)$/.test(s)) return "skip_rest";
  if (/^(?:yes|y|yep|yeah|ok|okay|confirm|confirmed|correct|right|go ahead|proceed|sure|looks good|that'?s right|do it)$/.test(s)) return "confirm";
  if (/^(?:no|n|nope|wrong|not right|incorrect|change|edit)$/.test(s)) return "deny";
  if (/^(?:resume|continue|carry on|go on|where were we)$/.test(s)) return "resume";
  if (/^(?:start (?:over|again)|restart|reset)$/.test(s)) return "restart";
  return null;
}

/** "3" / "#3" / "option 3" -> 3 */
export function parseChoiceIndex(english: string): number | null {
  const m = english.trim().match(/^(?:#|option\s*|number\s*|no\.?\s*)?(\d{1,2})[.)]?$/i);
  return m ? Number(m[1]) : null;
}

// ── amounts ────────────────────────────────────────────────────────────────────────
export interface Amount {
  value: number;
  /** why this needs a human look (shown as a choice, never silently resolved) */
  ambiguous?: { alt: number; reason: string };
}

/** Parse a single money token like "45000", "45,000", "₹45,000.50", "45k". Returns null if not a clean amount. */
export function parseAmountToken(token: string): Amount | null {
  const t = normaliseNumbers(token.trim().replace(/^(?:₹|rs\.?|inr|rupees?)\s*/i, "").replace(/\s*(?:₹|rs\.?|inr|rupees?|\/-)\s*$/i, "")).text.trim();
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  const [, dec = ""] = t.split(".");
  // "45.000": European/Indian-mixed grouping vs a decimal — never guess.
  if (dec.length === 3) {
    const alt = Number(t.replace(".", ""));
    return { value: Number(t), ambiguous: { alt, reason: `"${token.trim()}" could mean ${Number(t)} (decimal) or ${alt} (thousands)` } };
  }
  if (dec.length > 2) return null;
  const value = Number(t);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value };
}

const AMOUNT_CUE_RX = /(?:₹|\brs\.?|\binr\b|\brupees?\b)\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:₹|\brs\.?|\binr\b|\brupees?\b|\/-)/i;

export interface Segments {
  quantity?: number;
  amounts: string[]; // raw number tokens with a money cue
  bareNumbers: string[]; // numbers with no cue, after removing dates/qty
  rest: string; // what's left (names, item text)
}

/** Pull quantities and numbers out of the text; return what remains. Dates are stripped by the caller first. */
export function segmentNumbers(text: string): Segments {
  let rest = normaliseNumbers(text).text;
  let quantity: number | undefined;
  const q1 = rest.match(/\b(\d+(?:\.\d+)?)\s*(?:x|×|units?|pcs|pieces|nos|qty)\b/i) || rest.match(/\b(?:qty|quantity|units?)\s*[:=-]?\s*(\d+(?:\.\d+)?)\b/i);
  if (q1) { quantity = Number(q1[1]); rest = rest.replace(q1[0], " "); }
  const amounts: string[] = [];
  const cue = AMOUNT_CUE_RX.exec(rest);
  if (cue) { amounts.push((cue[1] ?? cue[2]).replace(/[.,]$/, "")); rest = rest.replace(cue[0], " "); }
  const priced = rest.match(/\b(?:amount|price|rate|cost|worth|total|of|for)\s*[:=-]?\s*(\d[\d.,]*\d|\d)\b/i);
  if (!amounts.length && priced) { amounts.push(priced[1]); rest = rest.replace(priced[0], " "); }
  const bare: string[] = [];
  rest = rest.replace(/(?<![\w.])\d[\d.,]*\d(?![\w])|(?<![\w.])\d(?![\w.])/g, (n) => { bare.push(n.replace(/[.,]$/, "")); return " "; });
  return { quantity, amounts, bareNumbers: bare, rest: rest.replace(/\s+/g, " ").trim() };
}

// ── customer text ──────────────────────────────────────────────────────────────────
const INTENT_LEAD_RX = /^\s*(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:(?:i\s+)?(?:want|need|require|would like|wish)\s+(?:to\s+)?(?:create|make|raise|generate)?\s*)?(?:(?:create|make|generate|draft|prepare|prep|raise|add|new|issue|write|cut|give|do)\s+(?:me\s+)?)?(?:an?\s+|the\s+|one\s+|new\s+)*(?:sales\s+)?(?:invoices?|bills?)\b\s*/i;

export function stripIntentLead(text: string): string {
  return text
    .replace(INTENT_LEAD_RX, "")
    .replace(/\b(?:invoices?|pls|plz|please|kindly)\b/gi, " ") // "acme invoice pls" → "acme"
    .replace(/\s{2,}/g, " ")
    .replace(/^(?:for|to|of|with|,|:)\s*/i, "")
    .trim();
}

/** Company-name suffix words never decide a match on their own. */
const SUFFIX = new Set(["pvt", "private", "ltd", "limited", "llp", "inc", "corp", "co", "and", "the", "traders", "trading", "enterprises", "industries", "sons", "company"]);

export const normName = (s: string) => s.toLowerCase().replace(/[.,'’"()&-]/g, " ").replace(/\s+/g, " ").trim();

export interface CustomerLite { id: string; name: string; aliases: string[] }

const nameKeys = (c: CustomerLite) => [c.name, ...c.aliases].filter(Boolean).map(normName);

export interface CustomerMatch {
  exact: CustomerLite[];
  near: CustomerLite[];
}

/** Exact = identical normalised name/alias. Near = similar but NEVER auto-accepted. */
export function matchCustomers(candidate: string, customers: CustomerLite[]): CustomerMatch {
  const c = normName(candidate);
  if (!c) return { exact: [], near: [] };
  const exact: CustomerLite[] = [];
  const near: { c: CustomerLite; d: number }[] = [];
  const cTokens = c.split(" ").filter((t) => !SUFFIX.has(t));
  for (const cust of customers) {
    const keys = nameKeys(cust);
    if (keys.includes(c)) { exact.push(cust); continue; }
    let best = Infinity;
    for (const k of keys) {
      const kTokens = k.split(" ").filter((t) => !SUFFIX.has(t));
      const d = levenshtein(c, k);
      const shared = cTokens.length > 0 && cTokens.every((t) => kTokens.includes(t) || kTokens.some((u) => u.length > 3 && t.length > 3 && levenshtein(t, u) <= 1));
      const contains = kTokens.length > 0 && (k.includes(c) || c.includes(k)) && Math.min(c.length, k.length) >= 3;
      if (d <= Math.max(2, Math.floor(c.length * 0.25)) || shared || contains) best = Math.min(best, d);
    }
    if (best < Infinity) near.push({ c: cust, d: best });
  }
  near.sort((a, b) => a.d - b.d);
  return { exact, near: near.slice(0, 5).map((n) => n.c) };
}

export { CREATE_VERB_RX };
