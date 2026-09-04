import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";
import AiAccountMapping from "@/models/ai/AiAccountMapping";

/**
 * The one place `AiAccountMapping` gets read (docs/ai/BRIEF-08b-FINAL.md 0.2) — a configured
 * mapping always wins over a heuristic; the heuristic itself is supplied by the caller (AI-11's
 * code-based inventory resolution, AI-22's suspense name-regex) and never reimplemented here.
 */

export interface ResolvedAccountMapping {
  resolved: boolean;
  accounts: { id: string; code: string; name: string }[];
  basis: string;
}

export async function resolveMappedAccounts(tenantId: string, role: string, heuristicFallback: () => Promise<ResolvedAccountMapping>): Promise<ResolvedAccountMapping> {
  await connectDB();
  const configured = await AiAccountMapping.findOne({ tenantId, role }).lean();
  if (configured && configured.accountIds.length > 0) {
    const accounts = await Account.find({ tenantId, _id: { $in: configured.accountIds } }).select("_id code name").lean();
    if (accounts.length > 0) {
      return { resolved: true, accounts: accounts.map((a) => ({ id: String(a._id), code: a.code, name: a.name })), basis: `explicitly configured (AiAccountMapping): ${configured.basis}` };
    }
  }
  return heuristicFallback();
}
