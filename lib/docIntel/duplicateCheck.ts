/**
 * Duplicate detection for extracted vendor bills — pure, so it's unit-testable.
 *
 * A candidate bill is a likely duplicate of an existing one when the same vendor
 * shows the same supplier bill number, OR the same vendor + same total appears.
 * The route layer supplies `existing` from a tenant-scoped DB query; this
 * function only decides the match, keeping the logic testable without a DB.
 */

import type { VendorBillExtraction } from "@/lib/docIntel/extractionSchemas";

export interface ExistingBill {
  id: string;
  vendorName: string;
  billNumber: string; // supplier's own number (stored in Invoice.sourceDocument)
  totalAmount: number;
}

export interface DuplicateMatch {
  id: string;
  reason: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function findDuplicates(
  candidate: Pick<VendorBillExtraction, "vendorName" | "billNumber" | "totalAmount">,
  existing: ExistingBill[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const cVendor = norm(candidate.vendorName);
  const cNum = norm(candidate.billNumber);

  for (const e of existing) {
    const sameVendor = cVendor && norm(e.vendorName) === cVendor;
    const sameNumber = cNum && norm(e.billNumber) === cNum;
    // Amount match tolerant to ±1 (rounding differences in extraction).
    const sameTotal =
      candidate.totalAmount > 0 && Math.abs(e.totalAmount - candidate.totalAmount) <= 1;

    if (sameNumber && (sameVendor || !cVendor)) {
      matches.push({ id: e.id, reason: `Same bill number "${e.billNumber}" from this vendor` });
    } else if (sameVendor && sameTotal) {
      matches.push({ id: e.id, reason: `Same vendor and total (${e.totalAmount})` });
    }
  }
  return matches;
}
