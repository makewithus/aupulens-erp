import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import InventoryItem from "@/models/inventory/InventoryItem";
import { matchPair, nameSimilarity, normalizeName } from "@/lib/aiRuntime/relatedParty/detectRelatedParties";
import type { RelatedPartyClassification } from "@/lib/aiRuntime/relatedParty/detectRelatedParties";

/**
 * AI-19's duplicate-entity detection (docs/ai/BRIEF-08a-BATCH-G.md, AI-19 detection set item 1) —
 * reuses AI-20's own `matchPair()`/`nameSimilarity()` (Chunk 6) for the vendor↔vendor and
 * customer↔customer cases, never a second entity-matching implementation. **Proposes a merge
 * survivor; never merges** — no write path touches `Customer` anywhere in this module.
 */

export interface DuplicatePair {
  aId: string;
  bId: string;
  score: number;
  classification: RelatedPartyClassification;
  matchedOn: string[];
  proposedSurvivor: string;
}

const ITEM_POSSIBLE_THRESHOLD = 0.6;

function proposeSurvivor(aId: string, aCreatedAt: Date | undefined, bId: string, bCreatedAt: Date | undefined): string {
  // The older record is proposed as the survivor — a human confirms either way.
  if (aCreatedAt && bCreatedAt) return aCreatedAt <= bCreatedAt ? aId : bId;
  return aId;
}

/** `role` scopes the candidate pool the same way AI-20 does: "customer" = records used in a sales
 *  role (out_invoice), "vendor" = records used in a purchase role (in_invoice) — never a full N²
 *  scan of every Customer record regardless of role. */
export async function findDuplicateEntities(tenantId: string, role: "customer" | "vendor"): Promise<DuplicatePair[]> {
  await connectDB();
  const moveType = role === "customer" ? "out_invoice" : "in_invoice";
  const candidateIds = (await Invoice.distinct("partnerId", { tenantId, moveType })).map(String);
  if (candidateIds.length < 2) return [];

  const records = await Customer.find({ tenantId, _id: { $in: candidateIds } }).lean();
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i] as unknown as { _id: unknown; createdAt?: Date; header?: { name?: string; displayName?: string }; contact_details?: { email?: string }; address_tab?: { street?: string; city?: string; zip?: string }; gstin?: string; pan?: string };
      const b = records[j] as unknown as typeof a;
      const match = matchPair(a, b);
      if (!match.classification) continue;
      const aId = String(a._id);
      const bId = String(b._id);
      pairs.push({
        aId,
        bId,
        score: match.score,
        classification: match.classification,
        matchedOn: match.matchedOn,
        proposedSurvivor: proposeSurvivor(aId, a.createdAt, bId, b.createdAt),
      });
    }
  }

  return pairs;
}

export async function findDuplicateItems(tenantId: string): Promise<DuplicatePair[]> {
  await connectDB();
  const items = await InventoryItem.find({ tenantId }).select("_id name itemCode createdAt").lean();
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (normalizeName(a.name) === normalizeName(b.name) && a.itemCode !== b.itemCode) {
        pairs.push({
          aId: String(a._id),
          bId: String(b._id),
          score: 1,
          classification: "probable", // exact normalized-name match, but no tax-ID-equivalent to reach "certain"
          matchedOn: ["name"],
          proposedSurvivor: proposeSurvivor(String(a._id), a.createdAt, String(b._id), b.createdAt),
        });
        continue;
      }
      const similarity = nameSimilarity(a.name, b.name);
      if (similarity >= ITEM_POSSIBLE_THRESHOLD) {
        pairs.push({
          aId: String(a._id),
          bId: String(b._id),
          score: similarity,
          classification: "possible",
          matchedOn: ["name_similarity"],
          proposedSurvivor: proposeSurvivor(String(a._id), a.createdAt, String(b._id), b.createdAt),
        });
      }
    }
  }

  return pairs;
}
