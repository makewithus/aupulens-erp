import mongoose from "mongoose";
import Asset from "@/models/finance/Asset";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule, { AI_SCHEDULE_TYPE } from "@/models/ai/AiSchedule";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * Fixed-asset register <-> GL control-account tie-out (docs/ai/BRIEF-03-BATCH-B.md AI-10,
 * "the highest-value part of this workflow" — and explicitly what AI-22, Chunk 4's continuous
 * reconciliation, will consume). A control-account-level comparison, not a per-asset one:
 * creating an `Asset` document posts no capitalisation entry of its own
 * (app/api/finance/assets/route.ts just saves the document) — the real capitalisation entry is
 * whatever vendor bill got coded to the same fixed-asset account through the normal bill-posting
 * flow. So the independently-sourced register figures are each asset's own `originalValue` plus
 * whatever AI-10's own depreciation `AiSchedule`s have actually posted, compared against
 * everything the GL says moved through that asset account — exactly how a real fixed-asset
 * subledger ties to its GL control account.
 */

export function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

export interface AssetAccountTieOut {
  assetAccountId: string;
  registerCost: number;
  registerAccumulatedDepreciation: number;
  registerNbv: number;
  glBalance: number;
  difference: number;
}

export async function computeAssetRegisterToGl(tenantId: string, assetAccountId: string): Promise<AssetAccountTieOut> {
  const assets = await Asset.find({ tenantId, "accounts.assetAccountId": assetAccountId, status: DOCUMENT_STATUS.POSTED })
    .select("_id originalValue")
    .lean();
  const assetIds = assets.map((a) => String(a._id));
  const registerCost = roundCurrency(assets.reduce((sum, a) => sum + (a.originalValue ?? 0), 0));

  const schedules = assetIds.length
    ? await AiSchedule.find({
        tenantId,
        scheduleType: AI_SCHEDULE_TYPE.DEPRECIATION,
        "sourceRef.model": "Asset",
        "sourceRef.id": { $in: assetIds },
      })
        .select("recognisedToDate")
        .lean()
    : [];
  const registerAccumulatedDepreciation = roundCurrency(schedules.reduce((sum, s) => sum + (s.recognisedToDate ?? 0), 0));
  const registerNbv = roundCurrency(registerCost - registerAccumulatedDepreciation);

  const rows = await JournalEntry.aggregate([
    { $match: { tenantId, status: DOCUMENT_STATUS.POSTED } },
    { $unwind: "$lineIds" },
    { $match: { "lineIds.accountId": new mongoose.Types.ObjectId(assetAccountId) } },
    { $group: { _id: null, debit: { $sum: "$lineIds.debit" }, credit: { $sum: "$lineIds.credit" } } },
  ]);
  const glBalance = rows[0] ? roundCurrency(rows[0].debit - rows[0].credit) : 0;

  return {
    assetAccountId,
    registerCost,
    registerAccumulatedDepreciation,
    registerNbv,
    glBalance,
    difference: roundCurrency(registerNbv - glBalance),
  };
}
