/**
 * Pure, registry-driven slot-filling state machine (no I/O except the injected lookups).
 * One question at a time; every value that reaches the summary was either typed verbatim,
 * picked from a list of REAL records, or is a shown default. Anything uncertain becomes a
 * question with choices — never a silent guess (Rule 7).
 */
import { looksLikeDate, resolveDate } from "./dates";
import {
  classifyIntent, matchCustomers, normName, parseAmountToken, parseChoiceIndex, parseControl,
  isGenericLeftover, LABELLED_FIELD_RX, segmentNumbers, stripIntentLead, type Control, type CustomerLite,
} from "./parse";
import { TASK_TARGETS, type SlotDef, type TaskTarget } from "./registry";

export interface SlotVal { value: any; display: string; note?: string; isDefault?: boolean }
export interface Choice { label: string; value: any }
export type Pending =
  | { kind: "customer"; candidate: string; choices: Choice[] }
  | { kind: "amount"; choices: Choice[] }
  | { kind: "item"; choices: Choice[] }
  | { kind: "intent" }
  | { kind: "change" };

export interface FlowState {
  v: 1;
  target: string;
  stage: "intent" | "collecting" | "confirming";
  slots: Record<string, SlotVal>;
  skipped: string[];
  order: string[];
  asked?: string;
  pending?: Pending;
}

export interface StepInput {
  english: string;
  original: string;
  today: string;
  /** Sarvam unavailable for non-English text: we can't trust free-text parsing. */
  degraded: boolean;
  /** Text was translated (or otherwise materially changed) — names must be verbatim or picked. */
  translated: boolean;
  protectedNames: string[];
  autoCreate: boolean;
}

export interface Lookups {
  findCustomers(q: string): Promise<CustomerLite[]>;
  lastCustomer(): Promise<CustomerLite | null>;
  customerCount(): Promise<number>;
  /** This tenant's most-used invoice line names (from real invoice history), best first. May be empty. */
  recentItems?(): Promise<string[]>;
}

export type ReplyKind =
  | "question" | "confirm" | "explain" | "ask_intent" | "open_form" | "execute"
  | "cancelled" | "not_handled" | "notice" | "no_customers";

export interface FlowReply {
  kind: ReplyKind;
  message: string;
  progress?: { current: number; total: number };
  choices?: string[];
  /** One-tap replies the chat can render as buttons (value is what gets sent as the user's message). */
  actions?: { label: string; value: string }[];
  summary?: { label: string; value: string; caveat?: string }[];
  prefill?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  createCustomerName?: string;
}
export interface StepOutput { state: FlowState | null; reply: FlowReply }


// ── "is this an ANSWER, or the user asking for something else?" ───────────────────────────────
// Reported by a user mid-question: "Invoices less than ₹25,000" was swallowed as a customer NAME, and
// "create the customer ramesh" became a customer called "create the customer ramesh". A message that asks for
// something else must be answered (the draft stays open); a command must be obeyed.
const COMPARE_RX = /\b(?:less\s+than|more\s+than|greater\s+than|fewer\s+than|above|below|under|over|between|at\s+least|at\s+most|upto|up\s+to)\b/i;
const ASK_START_RX = /^(?:how|what|whats|why|when|where|who|which|can|could|would|should|is|are|do|does|did|give|show|tell|list|find|get|fetch|display|view|check|search|explain|help|please\s+(?:give|show|tell|list|find))\b/i;
const RECORD_WORD_RX = /\b(?:invoices?|bills?|customers|payments?|orders?|quotes?|quotations?|reports?|receivables?|balance)\b/i;
const QUERYISH_RX = /\b(?:list|show|give|find|search|total|pending|overdue|unpaid|paid|outstanding|all|every|how many|how much|less|more|greater|between)\b/i;

export function isInterruption(english: string): boolean {
  const t = english.trim();
  if (!t) return false;
  if (/\?\s*$/.test(t)) return true;
  if (ASK_START_RX.test(t)) return true;
  if (COMPARE_RX.test(t) && /\d/.test(t)) return true; // "invoices less than 25,000"
  if (RECORD_WORD_RX.test(t) && QUERYISH_RX.test(t)) return true;
  if (t.split(/\s+/).length > 14) return true;
  return false;
}

/** "create the customer ramesh" / "add a new customer called Ramesh Traders" → the name, else null. */
export function parseCreateCustomer(english: string): string | null {
  const m = english.trim().match(/^(?:please\s+)?(?:create|add|make|new|register)\s+(?:a\s+|the\s+|new\s+)*(?:customer|client|party)\s+(?:named\s+|called\s+|as\s+|for\s+)?["“']?(.+?)["”']?\s*$/i);
  const name = m?.[1]?.trim().replace(/[.,;:!]+$/, "");
  return name && name.length <= 80 ? name : null;
}

/** Raw (untranslated) text that is plainly a request/query — used when translation is unavailable. */
const RAW_QUERYISH_RX = /\?|\b(?:list|show|dikha\w*|dijiye|dijie|batao|bataiye|bata do|kitn[aei]|kya|kaun|kaise|kab|kahan|saare|sabhi|invoices?|bills?|total)\b/i;

export const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const target = (s: FlowState): TaskTarget => TASK_TARGETS[s.target];

// ── construction ─────────────────────────────────────────────────────────────────
export function newState(targetId: string, stage: FlowState["stage"] = "collecting"): FlowState {
  const t = TASK_TARGETS[targetId];
  const slots: Record<string, SlotVal> = {};
  for (const s of t.slots) if (s.default) slots[s.key] = { value: s.default.value, display: s.default.display, isDefault: true };
  return { v: 1, target: targetId, stage, slots, skipped: [], order: [] };
}

const askable = (t: TaskTarget): SlotDef[] => t.slots.filter((s) => (s.required && !s.default) || s.askOptional);
const isResolved = (st: FlowState, k: string) => (st.slots[k] && !st.slots[k].isDefault) || st.skipped.includes(k);

export function progress(st: FlowState): { current: number; total: number } {
  const list = askable(target(st));
  const done = list.filter((s) => isResolved(st, s.key)).length;
  return { current: Math.min(done + 1, list.length), total: list.length };
}

/** Required slots still empty (defaults count as filled). */
const missingRequired = (st: FlowState): SlotDef[] =>
  target(st).slots.filter((s) => s.required && !st.slots[s.key]);

function nextSlot(st: FlowState): SlotDef | null {
  const t = target(st);
  return askable(t).find((s) => !isResolved(st, s.key)) ?? null;
}

// ── extraction ───────────────────────────────────────────────────────────────────
interface Extraction {
  updates: Record<string, SlotVal>;
  pending?: Pending;
  failures: string[];
  notes: string[];
  touched: boolean;
}

const CHANGE_RX = /^\s*(?:please\s+)?(?:change|set|update|make|edit|correct)\s+(?:the\s+)?(.+?)\s+(?:to|as|=)\s+(.+)$/i;

function slotByAlias(t: TaskTarget, word: string): SlotDef | undefined {
  const w = word.toLowerCase().trim();
  return t.slots.find((s) => s.key.toLowerCase() === w || s.aliases.includes(w));
}

const cleanCandidate = (s: string) =>
  s.replace(/^["'“‘]+|["'”’]+$/g, "").replace(/^(?:for|to|customer|client|party|bill(?:ed)?\s+to|name)\s*[:=-]?\s+/i, "")
    .replace(/\s+(?:invoice|please|now|thanks|thank you)\.?$/i, "").replace(/[.,;:!]+$/, "").trim();

async function resolveCustomer(candidate: string, inp: StepInput, lk: Lookups, out: Extraction): Promise<void> {
  // Prefer the user's own verbatim entity (the pipeline protected it) over any rewritten form.
  const own = inp.protectedNames.find((n) => normName(candidate).includes(normName(n)) || normName(n).includes(normName(candidate)));
  const cand = own && normName(own).length >= normName(candidate).length - 4 ? own : candidate;
  if (!cand || cand.length > 120) { out.failures.push("customer"); return; }
  const found = await lk.findCustomers(cand);
  const m = matchCustomers(cand, found);
  const verbatim = normName(inp.original).includes(normName(cand));

  if (m.exact.length === 1 && (verbatim || !inp.translated)) {
    const c = m.exact[0];
    out.updates.customer = { value: { id: c.id, name: c.name }, display: c.name };
    return;
  }
  const pool = m.exact.length ? m.exact : m.near;
  const choices: Choice[] = pool.slice(0, 5).map((c) => ({ label: c.name, value: { id: c.id, name: c.name } }));
  // Only offer to create a customer under a name the user actually typed (never a translated one).
  if (!m.exact.length && verbatim) choices.push({ label: `Create a new customer "${cand}"`, value: { createNew: true, name: cand } });
  choices.push({ label: "Someone else (type the name)", value: { retype: true } });
  out.pending = { kind: "customer", candidate: cand, choices };
}

async function extract(st: FlowState, inp: StepInput, lk: Lookups, opts: { stripLead: boolean }): Promise<Extraction> {
  const t = target(st);
  const out: Extraction = { updates: {}, failures: [], notes: [], touched: false };
  let text = inp.english.trim();
  let forced: SlotDef | undefined;

  const ch = text.match(CHANGE_RX);
  if (ch) {
    const slot = slotByAlias(t, ch[1]);
    if (slot) { forced = slot; text = ch[2]; }
  }
  if (opts.stripLead) text = stripIntentLead(text);

  // reference: "same customer as last time"
  if ((!forced || forced.key === "customer") && /\b(?:same|last|previous)\s+(?:customer|client|party)\b|\bsame as (?:last time|before)\b/i.test(text)) {
    const c = await lk.lastCustomer();
    if (c) out.updates.customer = { value: { id: c.id, name: c.name }, display: c.name, note: "from your most recent invoice" };
    else out.failures.push("There is no previous invoice to take the customer from.");
    text = text.replace(/\b(?:the\s+)?(?:same|last|previous)\s+(?:customer|client|party)\b(?:\s+as\s+(?:last\s+time|before|the last invoice))?|\bsame as (?:last time|before)\b/gi, " ");
  }

  // due date
  const wantDate = forced?.key === "dueDate" || st.asked === "dueDate";
  if (!forced || forced.key === "dueDate") {
    let seg: string | null = null;
    const m = text.match(/\bdue\s*(?:date)?\s*(?:in|on|by|within|:|-)?\s*([^,;]+)/i);
    if (m) { seg = m[1]; text = text.replace(m[0], " "); }
    else if (wantDate) { seg = text; text = ""; }
    else {
      const parts = text.split(/[,;\n]/);
      const idx = parts.findIndex((p) => looksLikeDate(p) && !/^\s*\d+\s*$/.test(p));
      if (idx >= 0) { seg = parts[idx]; parts.splice(idx, 1); text = parts.join(","); }
    }
    if (seg !== null) {
      const d = resolveDate(seg, inp.today, true);
      if (!d) out.failures.push("I couldn't read that as a date.");
      else if (d.past) out.failures.push(`${d.label} is in the past — a due date can't be before today.`);
      else out.updates.dueDate = { value: d.iso, display: d.label, note: d.caveat };
    }
  }

  // numbers
  if (!forced || ["unitPrice", "quantity"].includes(forced.key)) {
    // A minus sign must never be silently dropped ("-500" becoming 500).
    if (/(?<![\w\d])[-−–]\s*\d/.test(text)) {
      out.failures.push("I couldn't read a negative number as an amount or quantity.");
      text = text.replace(/(?<![\w\d])[-−–]\s*\d[\d.,]*/g, " ");
    }
    // "200 x 5" reads two ways (200 units at 5? 5 units at 200?) — never guess which is which.
    if (/\d[\d.,]*\s*[x×]\s*\d[\d.,]*/i.test(text)) {
      out.failures.push("I can read that in two ways — please give the quantity and the price separately (e.g. \"quantity 5, amount 200\").");
      text = text.replace(/\d[\d.,]*\s*[x×]\s*\d[\d.,]*/gi, " ");
    }
    const seg = segmentNumbers(text);
    text = seg.rest;
    const numericAsked = ["unitPrice", "quantity"].includes(forced?.key ?? st.asked ?? "");
    if (seg.quantity !== undefined) {
      if (seg.quantity < 1) out.failures.push("Quantity must be at least 1.");
      else out.updates.quantity = { value: seg.quantity, display: String(seg.quantity) };
    }
    const cands = [...seg.amounts, ...seg.bareNumbers];
    let wantSlot: "unitPrice" | "quantity" | null = null;
    if (forced?.key === "quantity" || (!forced && st.asked === "quantity" && seg.quantity === undefined)) wantSlot = "quantity";
    else if (forced?.key === "unitPrice" || numericAsked || !st.slots.unitPrice || st.slots.unitPrice.isDefault) wantSlot = "unitPrice";
    if (cands.length && wantSlot === "quantity") {
      const q = Number(cands[0].replace(/,/g, ""));
      if (cands.length > 1) out.failures.push("I found more than one number — which is the quantity?");
      else if (!(q >= 1)) out.failures.push("Quantity must be at least 1.");
      else out.updates.quantity = { value: q, display: String(q) };
    } else if (cands.length && wantSlot === "unitPrice") {
      if (cands.length > 1 && seg.amounts.length !== 1) {
        const parsed = cands.map(parseAmountToken).filter(Boolean) as { value: number }[];
        out.pending = { kind: "amount", choices: [...new Set(parsed.map((p) => p.value))].map((v) => ({ label: money(v), value: v })) };
        out.failures.push(`I found ${cands.join(" and ")} — which one is the amount?`);
      } else {
        const a = parseAmountToken(seg.amounts[0] ?? cands[0]);
        if (!a) out.failures.push(`I couldn't read "${seg.amounts[0] ?? cands[0]}" as an amount.`);
        else if (a.ambiguous) {
          out.pending = { kind: "amount", choices: [{ label: money(a.ambiguous.alt), value: a.ambiguous.alt }, { label: money(a.value), value: a.value }] };
          out.failures.push(a.ambiguous.reason + ".");
        } else if (a.value > 10_000_000) {
          out.pending = { kind: "amount", choices: [{ label: `Yes, ${money(a.value)}`, value: a.value }, { label: "No, let me re-enter it", value: null }] };
          out.failures.push(`${money(a.value)} is very large — please confirm.`);
        } else out.updates.unitPrice = { value: a.value, display: money(a.value) };
      }
    } else if (cands.length && !forced) {
      out.failures.push(`I already have the amount (${money(st.slots.unitPrice.value)}). To change it, say "change amount to …".`);
    }
  }

  // free text: customer / item
  const wantsText = forced ? (forced.kind === "customer" || forced.kind === "text" ? forced : undefined) : undefined;
  if (!forced || wantsText) {
    const parts = text.split(/[,;\n|]/).map((p) => p.trim()).filter(Boolean);
    for (const raw of parts) {
      if (/\?\s*$/.test(raw) || raw.length > 160 || LABELLED_FIELD_RX.test(raw)) continue;
      const itemM = raw.match(/^(?:item|product|service|description)\s*[:=-]?\s*(.+)$/i);
      let slot: SlotDef | undefined = wantsText;
      let val = raw;
      if (!slot) {
        if (itemM) { slot = t.slots.find((s) => s.key === "itemName"); val = itemM[1]; }
        else if (/^(?:for|to|customer|client|party|bill(?:ed)?\s+to)\b/i.test(raw) && !st.slots.customer && !out.updates.customer) slot = t.slots.find((s) => s.kind === "customer");
        else {
          const askedDef = st.asked ? t.slots.find((s) => s.key === st.asked) : undefined;
          if (askedDef && (askedDef.kind === "customer" || askedDef.kind === "text") && !out.updates[askedDef.key]) slot = askedDef;
          else if (!st.slots.customer && !out.updates.customer && !out.pending) slot = t.slots.find((s) => s.kind === "customer");
          else if (!st.slots.itemName && !out.updates.itemName) slot = t.slots.find((s) => s.key === "itemName");
        }
      }
      if (!slot) continue;
      const cleaned = cleanCandidate(val);
      if (!cleaned || isGenericLeftover(cleaned)) continue; // never let "amount"/"rupees"/"due" become a name
      if (slot.kind === "customer") await resolveCustomer(cleaned, inp, lk, out);
      else if (cleaned.length <= 120) out.updates[slot.key] = { value: cleaned, display: cleaned };
    }
  }

  out.touched = Object.keys(out.updates).length > 0 || !!out.pending || out.failures.length > 0;
  return out;
}

// ── replies ──────────────────────────────────────────────────────────────────────
function summaryLines(st: FlowState): NonNullable<FlowReply["summary"]> {
  const t = target(st);
  const lines: NonNullable<FlowReply["summary"]> = [];
  const get = (k: string) => st.slots[k];
  for (const s of t.slots) {
    const v = get(s.key);
    if (!v) { if (s.key === "dueDate") lines.push({ label: s.label, value: "not set (defaults to today)" }); continue; }
    lines.push({ label: s.label, value: v.display + (v.isDefault ? " (default)" : ""), caveat: v.note });
  }
  const q = Number(get("quantity")?.value ?? 1);
  const p = Number(get("unitPrice")?.value ?? 0);
  if (p) lines.push({ label: "Subtotal", value: `${money(Math.round(q * p * 100) / 100)} (before tax)` });
  return lines;
}


function flowActions(st: FlowState, kind: "question" | "confirm", autoCreate = false): { label: string; value: string }[] {
  const t = target(st);
  if (kind === "confirm") {
    return [
      { label: autoCreate ? "Create draft now" : `Yes, open the ${t.label} form`, value: "yes" },
      ...(autoCreate ? [{ label: "Review in the form first", value: "open form" }] : []),
      { label: "Change something", value: "change" },
      { label: "Cancel", value: "cancel" },
    ];
  }
  const slot = nextSlot(st);
  return [
    ...(st.order.length ? [{ label: "Back", value: "back" }] : []),
    ...(slot && !slot.required ? [{ label: "Skip", value: "skip" }] : []),
    { label: "Skip the questions — open the form", value: "open the form" },
    { label: "Cancel", value: "cancel" },
  ];
}

function askReply(st: FlowState, prefix = ""): FlowReply {
  const t = target(st);
  const slot = nextSlot(st)!;
  st.asked = slot.key;
  const pr = progress(st);
  const pend = st.pending;
  const choices = pend && "choices" in pend ? pend.choices.map((c) => c.label) : undefined;
  const lines = [
    prefix,
    `Question ${pr.current} of ${pr.total} · ${slot.label}`,
    slot.ask,
    `(${slot.why}.)`,
  ];
  if (choices) lines.push("", ...choices.map((c, i) => `${i + 1}. **${c}**`), "", "Reply with a number, or type the answer.");
  lines.push("", `You can say "back", ${slot.required ? "" : '"skip", '}"open the form" (skip the questions), or "cancel" at any time.`);
  return { kind: "question", message: lines.filter((l, i) => l !== "" || i > 0).join("\n").replace(/^\n+/, ""), progress: pr, choices, actions: flowActions(st, "question") };
}

function pendingReply(st: FlowState, notice: string): FlowReply {
  const pend = st.pending as Extract<Pending, { choices: Choice[] }>;
  const slotKey = pend.kind === "customer" ? "customer" : pend.kind === "item" ? "itemName" : "unitPrice";
  const slot = target(st).slots.find((s) => s.key === slotKey)!;
  st.asked = slotKey;
  const pr = progress(st);
  const lines = [notice, "", `Question ${pr.current} of ${pr.total} · ${slot.label}`, ...(pend.kind === "item" ? [slot.ask] : []), ...pend.choices.map((c, i) => `${i + 1}. **${c.label}**`), "", "Reply with a number, or type the answer.", "", `You can say "back", "open the form" (skip the questions), or "cancel" at any time.`];
  return { kind: "question", message: lines.join("\n"), progress: pr, choices: pend.choices.map((c) => c.label), actions: flowActions(st, "question") };
}

function confirmReply(st: FlowState, autoCreate: boolean, notice = ""): FlowReply {
  const t = target(st);
  st.stage = "confirming";
  st.asked = undefined;
  st.pending = undefined;
  const summary = summaryLines(st);
  const body = summary.map((l) => `- ${l.label}: **${l.value}**${l.caveat ? ` (⚠ ${l.caveat})` : ""}`).join("\n");
  const unset = t.slots.filter((s) => !st.slots[s.key] && !s.required);
  const hint = unset.length ? `\nTo add ${unset.map((s) => s.label.toLowerCase()).join(" / ")}, say e.g. "change ${unset[0].aliases[0]} to …".` : "";
  const act = autoCreate
    ? `Reply "yes" to create this ${t.label} as a draft now, "open form" to review it in the form first, "change" to edit something, or "cancel".`
    : `Reply "yes" to open the ${t.label} form with these details, "change" to edit something, or "cancel".`;
  return {
    kind: "confirm",
    actions: flowActions(st, "confirm", autoCreate),
    message: `${notice ? notice + "\n\n" : ""}Here is the ${t.label} I'll prepare — please check it:\n${body}${hint}\n\n${act}`,
    summary,
  };
}

export function explainReply(targetId: string): FlowReply {
  const h = TASK_TARGETS[targetId].howTo;
  const steps = h.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const fields = h.fields.map((f) => `- **${f.label}** — ${f.meaning}`).join("\n");
  return {
    kind: "explain",
    message: `You can find this at ${h.where}.\n\n${steps}\n\nWhat the main fields mean:\n${fields}${h.tip ? `\n\n${h.tip}` : ""}`,
  };
}

function finish(st: FlowState, inp: StepInput, viaForm: boolean): StepOutput {
  const t = target(st);
  const v: Record<string, any> = {};
  for (const [k, s] of Object.entries(st.slots)) v[k] = s.value;
  const ctx = { today: inp.today };
  if (inp.autoCreate && !viaForm) {
    return { state: st, reply: { kind: "execute", message: `Creating the ${t.label} as a draft…`, payload: t.toPayload(v, ctx), prefill: t.toPrefill(v, ctx) } };
  }
  return {
    state: null,
    reply: { kind: "open_form", message: `Opening the ${t.label} form with your details filled in — review it and click Create to save.`, prefill: t.toPrefill(v, ctx) },
  };
}

// ── state transitions ────────────────────────────────────────────────────────────
function apply(st: FlowState, ex: Extraction): void {
  for (const [k, v] of Object.entries(ex.updates)) {
    st.slots[k] = v;
    st.skipped = st.skipped.filter((s) => s !== k);
    st.order = st.order.filter((o) => o !== k);
    st.order.push(k);
  }
  if (Object.keys(ex.updates).length) st.pending = undefined;
}

function resolvePending(st: FlowState, inp: StepInput): { done: boolean; note?: string } {
  const p = st.pending;
  if (!p || p.kind === "intent" || p.kind === "change") return { done: false };
  const idx = parseChoiceIndex(inp.english);
  const label = normName(inp.english);
  const pick = idx ? p.choices[idx - 1] : p.choices.find((c) => normName(c.label) === label);
  if (!pick) return { done: false };
  if (p.kind === "customer") {
    const v = pick.value;
    if (v.retype) { st.pending = undefined; return { done: true, note: "Okay — type the customer's name." }; }
    if (v.createNew) return { done: true, note: `CREATE_CUSTOMER:${v.name}` };
    st.slots.customer = { value: { id: v.id, name: v.name }, display: v.name };
  } else if (p.kind === "item") {
    st.slots.itemName = { value: pick.value, display: String(pick.value) };
  } else {
    if (pick.value === null) { st.pending = undefined; return { done: true, note: "Okay — what is the amount?" }; }
    st.slots.unitPrice = { value: pick.value, display: money(pick.value) };
  }
  const key = p.kind === "customer" ? "customer" : p.kind === "item" ? "itemName" : "unitPrice";
  st.order = st.order.filter((o) => o !== key);
  st.order.push(key);
  st.pending = undefined;
  return { done: true };
}

async function next(st: FlowState, inp: StepInput, lk: Lookups, notice = ""): Promise<StepOutput> {
  if (st.pending && "choices" in st.pending) return { state: st, reply: pendingReply(st, notice) };
  const slot = nextSlot(st);
  if (!slot) return { state: st, reply: confirmReply(st, inp.autoCreate, notice) };
  st.stage = "collecting";
  // Item name is never defaulted (it lands on a customer-facing document). Offer this tenant's own recent
  // line names as one-tap choices; free text is still accepted.
  if (slot.key === "itemName" && lk.recentItems) {
    let items: string[] = [];
    try { items = (await lk.recentItems()).slice(0, 5); } catch { /* history unavailable: plain question */ }
    if (items.length) {
      st.pending = { kind: "item", choices: items.map((n) => ({ label: n, value: n })) };
      return { state: st, reply: pendingReply(st, notice) };
    }
  }
  return { state: st, reply: askReply(st, notice) };
}

const notHandled = (st: FlowState | null): StepOutput => ({ state: st, reply: { kind: "not_handled", message: "" } });

export async function startFlow(targetId: string, inp: StepInput, lk: Lookups): Promise<StepOutput> {
  const t = TASK_TARGETS[targetId];
  const st = newState(targetId);
  if ((await lk.customerCount()) === 0) {
    return { state: null, reply: { kind: "no_customers", message: `You don't have any customers yet, and every ${t.label} needs one. I can open the New Customer form for you first.` } };
  }
  const ex = await extract(st, inp, lk, { stripLead: true });
  apply(st, ex);
  st.pending = ex.pending;
  // Skip ahead: everything MANDATORY was supplied in the first message ⇒ straight to the summary, no questions.
  // (Optional fields such as the due date show in the summary and can be changed there.)
  if (!st.pending && missingRequired(st).length === 0 && !ex.failures.length) return { state: st, reply: confirmReply(st, inp.autoCreate) };
  return next(st, inp, lk, ex.failures.join("\n"));
}

export async function stepFlow(st: FlowState, inp: StepInput, lk: Lookups): Promise<StepOutput> {
  const t = target(st);
  const ctrl: Control | null = parseControl(inp.english);

  if (ctrl === "cancel") return { state: null, reply: { kind: "cancelled", message: `Okay — I've cancelled that ${t.label}. Nothing was created.` } };
  if (ctrl === "restart") { const fresh = newState(st.target); return next(fresh, inp, lk, "Starting over."); }

  if (ctrl === "open_form") return finish(st, inp, true); // "skip the questions and open the form": whatever is known, prefilled

  if (st.stage === "intent") {
    const idx = parseChoiceIndex(inp.english);
    const s = inp.english.toLowerCase();
    if (idx === 1 || /\bexplain|how\b/.test(s)) return { state: null, reply: explainReply(st.target) };
    if (idx === 2 || /\bcreate|make|do it|for me|yes\b/.test(s) || ctrl === "confirm") {
      const fresh = newState(st.target);
      if ((await lk.customerCount()) === 0) return { state: null, reply: { kind: "no_customers", message: `You don't have any customers yet, and every ${t.label} needs one. I can open the New Customer form for you first.` } };
      return next(fresh, inp, lk);
    }
    return { state: st, reply: { kind: "ask_intent", message: `Sorry, I didn't catch that. Reply 1 to have it explained, or 2 to create it for you.`, choices: ["Explain how to create it", "Create it for me"], actions: [{ label: "Explain how", value: "1" }, { label: "Create it for me", value: "2" }] } };
  }

  if (ctrl === "resume") return next(st, inp, lk);

  if (ctrl === "back") {
    const last = st.order.pop();
    if (!last) return next(st, inp, lk, "There's nothing to go back to yet.");
    delete st.slots[last];
    const def = t.slots.find((s) => s.key === last)?.default;
    if (def) st.slots[last] = { value: def.value, display: def.display, isDefault: true };
    st.skipped = st.skipped.filter((s) => s !== last);
    st.pending = undefined;
    st.stage = "collecting";
    return next(st, inp, lk, `Okay — going back to ${t.slots.find((s) => s.key === last)!.label}.`);
  }

  if (st.stage === "confirming") {
    if (ctrl === "confirm" || /^\s*(?:yes[, ]+)?(?:create|do it|create it|create (?:the )?(?:invoice|draft))\s*$/i.test(inp.english)) return finish(st, inp, false);
    if (/^\s*open (?:the )?form\s*$/i.test(inp.english)) return finish(st, inp, true);
    if (ctrl === "deny" || /^\s*change\b\s*$/i.test(inp.english)) {
      st.pending = { kind: "change" };
      return { state: st, reply: { kind: "question", message: `What would you like to change? ${t.slots.map((s) => s.label).join(", ")} — e.g. "change amount to 5000".` } };
    }
  }

  if (ctrl === "skip" || ctrl === "skip_rest") {
    const slot = nextSlot(st);
    if (ctrl === "skip") {
      if (!slot) return next(st, inp, lk);
      if (slot.required) return next(st, inp, lk, `${slot.label} is required, so I can't skip it.`);
      st.skipped.push(slot.key);
      return next(st, inp, lk);
    }
    for (const s of askable(t)) if (!s.required && !isResolved(st, s.key)) st.skipped.push(s.key);
    return next(st, inp, lk);
  }

  // A command in the middle of a draft: "create the customer ramesh" → open the New Customer form; the draft stays open.
  const newCust = parseCreateCustomer(inp.english);
  if (newCust) {
    return { state: st, reply: { kind: "no_customers", message: `Opening the New Customer form for ${newCust}. Save it there, then say "continue" and I'll pick your ${t.label} draft back up.`, createCustomerName: newCust } };
  }

  if (inp.degraded && !inp.translated && inp.english === inp.original && /[^\x00-\x7f]|\b(?:ke|liye|banao|karo|hai|venum|kavali|mujhe|dijiye|dikhao|saare)\b/i.test(inp.original)) {
    // Non-English text we could NOT translate: never parse it into a slot (could misfill). If it is plainly a request/query,
    // hand it to the assistant (which understands Roman Hindi itself) and keep the draft; otherwise say so.
    const idx = parseChoiceIndex(inp.english);
    if (!(idx && st.pending) && !/^\s*\d[\d.,]*\s*$/.test(inp.english)) {
      if (RAW_QUERYISH_RX.test(inp.original)) return notHandled(st);
      return { state: st, reply: { kind: "notice", message: "I couldn't translate that just now, so I didn't use it. Please answer in English, or try again in a moment." } };
    }
  }

  // choices from a pending question
  const rp = resolvePending(st, inp);
  if (rp.done) {
    if (rp.note?.startsWith("CREATE_CUSTOMER:")) {
      return { state: null, reply: { kind: "no_customers", message: `Okay — I'll open the New Customer form for ${rp.note.slice(16)}. Create them, then ask me for the ${t.label} again.`, createCustomerName: rp.note.slice(16) } };
    }
    return next(st, inp, lk, rp.note ?? "");
  }
  if (st.pending?.kind === "change") st.pending = undefined;

  // The user is asking for something ELSE (a question, a list, "invoices less than 25,000"…): answer it, keep the draft, don't fill a slot.
  if (isInterruption(inp.english)) return notHandled(st);

  const ex = await extract(st, inp, lk, { stripLead: /\binvoice\b/i.test(inp.english) });
  if (!ex.touched) {
    // Not an answer. A question / unrelated message: leave the draft open and let the caller answer it.
    const q = /\?\s*$/.test(inp.english) || /^(?:how|what|why|when|where|who|which|can|could|is|are|do|does)\b/i.test(inp.english);
    if (q || !st.asked) return notHandled(st);
    const asked = t.slots.find((s) => s.key === st.asked);
    if (asked && (asked.kind === "money" || asked.kind === "quantity" || asked.kind === "date")) {
      return next(st, inp, lk, `I couldn't read that as ${asked.kind === "money" ? "an amount" : asked.kind === "date" ? "a date" : "a quantity"}.`);
    }
    return notHandled(st);
  }
  apply(st, ex);
  if (ex.pending) st.pending = ex.pending;
  const wasConfirming = st.stage === "confirming";
  if (wasConfirming && !ex.failures.length && !st.pending) return { state: st, reply: confirmReply(st, inp.autoCreate, "Updated.") };
  return next(st, inp, lk, ex.failures.join("\n"));
}

export { classifyIntent };
