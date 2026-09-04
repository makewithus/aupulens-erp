import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import { DOCUMENT_STATUS, PAYMENT_STATE } from "@/lib/constants/statuses";

/**
 * AI-20's related-party detection (docs/ai/BRIEF-06-BATCH-E.md, AI-20 Part B item 2) — buildable
 * within one tenant, unlike consolidation itself (see `docs/ai/AI-20-ARCHITECTURE-NOTE.md`).
 *
 * **The brief frames this as "match Customer against Vendor."** This codebase doesn't have a
 * separate vendor table for Finance purposes — `PurchaseOrder.partnerId` and vendor-bill
 * `Invoice.partnerId` both ref `Customer` (Odoo-style unified partner model, `CLAUDE.md` Known
 * Issue #4; `models/admin/Vendor.ts` is an unrelated procurement-rating list with no GSTIN/PAN/
 * address, never used by Finance). So "Customer vs Vendor" here means: does one `Customer` record
 * used in a **sales role** (open receivable) structurally look like the same real-world entity as
 * a *different* `Customer` record used in a **purchase role** (open payable) — the textbook
 * concealed self-dealing/kickback risk this workflow exists to surface.
 *
 * **Never proposes, merges, or eliminates anything** — OBSERVE, read-only. "These two records look
 * like the same entity, here is the evidence, a human should confirm."
 *
 * Matching criteria, in descending strength:
 * - shared tax registration number (`gstin`) or `pan`, exact — `certain` (a government-issued ID
 *   match is as certain as this gets without a human).
 * - shared normalized address, or same non-generic email domain AND similar names — `probable`.
 * - name similarity alone, nothing else shared — `possible`, **never** `certain` (the brief's own
 *   explicit false-positive guard: two genuinely different similar-named companies with no shared
 *   identifiers must not be promoted past `possible`).
 * - shared bank account — **not implemented**: `Customer` has no bank-details field anywhere in
 *   this schema (confirmed absent, not assumed) to compare.
 */

const MIN_NAME_SIMILARITY = 0.6;
const CANDIDATE_LIMIT = 300;
const GENERIC_EMAIL_DOMAINS = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "rediffmail.com", "protonmail.com"]);
const LEGAL_SUFFIX_RE = /\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|co|company)\b/g;

export type RelatedPartyClassification = "certain" | "probable" | "possible";

export interface RelatedPartyMatch {
  customerRef: string;
  vendorRef: string;
  matchScore: number;
  matchedOn: string[];
  classification: RelatedPartyClassification;
  receivableExposure: number;
  payableExposure: number;
  net: number;
  transactionRefs: string[];
}

interface CustomerLike {
  header?: { name?: string; displayName?: string };
  contact_details?: { email?: string };
  address_tab?: { street?: string; city?: string; zip?: string };
  gstin?: string;
  pan?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(LEGAL_SUFFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeAddress(addr?: { street?: string; city?: string; zip?: string }): string | null {
  if (!addr) return null;
  const parts = [addr.street, addr.city, addr.zip].filter(Boolean).map((s) => s!.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (parts.length === 0 || parts.every((p) => p.length === 0)) return null;
  return parts.join("|");
}

function emailDomain(email?: string): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain && !GENERIC_EMAIL_DOMAINS.has(domain) ? domain : null;
}

interface MatchResult {
  classification: RelatedPartyClassification | null;
  matchedOn: string[];
  score: number;
}

export function matchPair(c: CustomerLike, v: CustomerLike): MatchResult {
  const matchedOn: string[] = [];
  let certain = false;
  let probable = false;

  const cGstin = c.gstin?.trim().toUpperCase();
  const vGstin = v.gstin?.trim().toUpperCase();
  if (cGstin && vGstin && cGstin === vGstin) {
    certain = true;
    matchedOn.push("tax_registration_number");
  }

  const cPan = c.pan?.trim().toUpperCase();
  const vPan = v.pan?.trim().toUpperCase();
  if (cPan && vPan && cPan === vPan) {
    certain = true;
    matchedOn.push("pan");
  }

  const cAddr = normalizeAddress(c.address_tab);
  const vAddr = normalizeAddress(v.address_tab);
  if (cAddr && vAddr && cAddr === vAddr) {
    probable = true;
    matchedOn.push("address");
  }

  const cName = c.header?.displayName || c.header?.name || "";
  const vName = v.header?.displayName || v.header?.name || "";
  const similarity = nameSimilarity(cName, vName);

  const cDomain = emailDomain(c.contact_details?.email);
  const vDomain = emailDomain(v.contact_details?.email);
  if (cDomain && vDomain && cDomain === vDomain && similarity >= MIN_NAME_SIMILARITY) {
    probable = true;
    matchedOn.push("email_domain_and_name");
  }

  let possible = false;
  if (!certain && !probable && similarity >= MIN_NAME_SIMILARITY) {
    possible = true;
    matchedOn.push("name_similarity");
  }

  if (!certain && !probable && !possible) return { classification: null, matchedOn: [], score: 0 };

  const classification: RelatedPartyClassification = certain ? "certain" : probable ? "probable" : "possible";
  const base = certain ? 0.95 : probable ? 0.7 : 0.45;
  const bonus = Math.min(0.05 * Math.max(matchedOn.length - 1, 0), 0.05);
  return { classification, matchedOn, score: Math.min(1, round2(base + bonus)) };
}

async function loadOpenBalances(tenantId: string, moveType: "out_invoice" | "in_invoice", partnerIds: string[]): Promise<Map<string, { total: number; refs: string[] }>> {
  const rows = await Invoice.find({
    tenantId,
    moveType,
    partnerId: { $in: partnerIds.map((id) => new mongoose.Types.ObjectId(id)) },
    paymentState: { $ne: PAYMENT_STATE.PAID },
    state: { $ne: DOCUMENT_STATUS.CANCELLED },
  })
    .select("partnerId amountResidual")
    .lean();

  const map = new Map<string, { total: number; refs: string[] }>();
  for (const r of rows) {
    const key = String(r.partnerId);
    const entry = map.get(key) ?? { total: 0, refs: [] };
    entry.total += (r as { amountResidual?: number }).amountResidual ?? 0;
    entry.refs.push(String(r._id));
    map.set(key, entry);
  }
  return map;
}

const CLASSIFICATION_RANK: Record<RelatedPartyClassification, number> = { certain: 0, probable: 1, possible: 2 };

/** Candidate pairs are bounded to real counterparties with real open exposure — a customer-role
 *  partner (open receivable) crossed with a vendor-role partner (open payable), never a full
 *  N×2 scan of every partner record in the tenant. */
export async function detectRelatedParties(tenantId: string): Promise<RelatedPartyMatch[]> {
  await connectDB();

  const customerCandidateIds = (
    await Invoice.distinct("partnerId", { tenantId, moveType: "out_invoice", paymentState: { $ne: PAYMENT_STATE.PAID }, state: { $ne: DOCUMENT_STATUS.CANCELLED } })
  )
    .map(String)
    .slice(0, CANDIDATE_LIMIT);
  const vendorCandidateIds = (
    await Invoice.distinct("partnerId", { tenantId, moveType: "in_invoice", paymentState: { $ne: PAYMENT_STATE.PAID }, state: { $ne: DOCUMENT_STATUS.CANCELLED } })
  )
    .map(String)
    .slice(0, CANDIDATE_LIMIT);

  if (customerCandidateIds.length === 0 || vendorCandidateIds.length === 0) return [];

  const unionIds = Array.from(new Set([...customerCandidateIds, ...vendorCandidateIds]));
  const customers = await Customer.find({ tenantId, _id: { $in: unionIds.map((id) => new mongoose.Types.ObjectId(id)) } }).lean();
  const customerMap = new Map(customers.map((c) => [String(c._id), c as unknown as CustomerLike]));

  const [receivables, payables] = await Promise.all([
    loadOpenBalances(tenantId, "out_invoice", customerCandidateIds),
    loadOpenBalances(tenantId, "in_invoice", vendorCandidateIds),
  ]);

  const results: RelatedPartyMatch[] = [];
  for (const cId of customerCandidateIds) {
    const c = customerMap.get(cId);
    if (!c) continue;
    for (const vId of vendorCandidateIds) {
      if (cId === vId) continue;
      const v = customerMap.get(vId);
      if (!v) continue;
      const match = matchPair(c, v);
      if (!match.classification) continue;

      const receivable = receivables.get(cId) ?? { total: 0, refs: [] };
      const payable = payables.get(vId) ?? { total: 0, refs: [] };
      results.push({
        customerRef: cId,
        vendorRef: vId,
        matchScore: match.score,
        matchedOn: match.matchedOn,
        classification: match.classification,
        receivableExposure: round2(receivable.total),
        payableExposure: round2(payable.total),
        net: round2(receivable.total - payable.total),
        transactionRefs: [...receivable.refs, ...payable.refs].slice(0, 20),
      });
    }
  }

  return results.sort((a, b) => CLASSIFICATION_RANK[a.classification] - CLASSIFICATION_RANK[b.classification] || b.matchScore - a.matchScore);
}
