import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";
import { preferredAccountCodes, accountPreference } from "@/lib/accounting/inventory";
import { resolveMappedAccounts, type ResolvedAccountMapping } from "@/lib/aiRuntime/accountMapping/resolve";

/**
 * AI-11's first job (docs/ai/BRIEF-08a-BATCH-G.md, AI-11): "which accounts constitute inventory
 * for reporting, given no dedicated inventory account type and the `asset_current` bucket in
 * use?" **Chunk 8b (0.2)**: a hard-coded account code is a latent false-completion path for any
 * tenant whose Chart of Accounts doesn't use `"1300"` — `resolveMappedAccounts()` now checks
 * `models/ai/AiAccountMapping.ts` (role `"inventory"`) FIRST, so a human can override this
 * tenant-by-tenant; the heuristic below (the original Chunk 8a logic, unchanged) is only the
 * fallback when nothing is explicitly configured. This closes the question
 * `docs/ai/OPEN_QUESTIONS.md` #21 (AI-22's `inventory` reconciliation definition) and
 * #24 (AI-25's inventory-days gap) were both left waiting on.
 */

export interface InventoryAccountMapping {
  resolved: boolean;
  accounts: { id: string; code: string; name: string }[];
  basis: string;
}

export async function resolveInventoryAccountMapping(tenantId: string): Promise<InventoryAccountMapping> {
  return resolveMappedAccounts(tenantId, "inventory", () => resolveInventoryAccountHeuristic(tenantId));
}

async function resolveInventoryAccountHeuristic(tenantId: string): Promise<ResolvedAccountMapping> {
  await connectDB();
  for (const code of preferredAccountCodes.inventory) {
    const account = await Account.findOne({ tenantId, code }).lean();
    if (account) {
      return { resolved: true, accounts: [{ id: String(account._id), code: account.code, name: account.name }], basis: `Chart-of-Accounts code "${code}" — the same account lib/accounting/inventory.ts::postStockMoveAccounting() actually posts to` };
    }
  }

  const accounts = await Account.find({ tenantId, account_type: { $in: accountPreference.inventory } }).select("_id code name account_type").lean();
  if (accounts.length > 0) {
    return {
      resolved: accounts.length === 1,
      accounts: accounts.map((a) => ({ id: String(a._id), code: a.code, name: a.name })),
      basis: accounts.length === 1
        ? `no account with code "${preferredAccountCodes.inventory[0]}" exists; exactly one ${accountPreference.inventory.join("/")} account found, used unambiguously`
        : `no account with code "${preferredAccountCodes.inventory[0]}" exists; ${accounts.length} ${accountPreference.inventory.join("/")} accounts exist, none can be picked unambiguously — this is exactly the AiCloseState/AI-22 "asset_current bucket" simplification (docs/ai/OPEN_QUESTIONS.md #21), now confirmed as the reason, not assumed`,
    };
  }

  return { resolved: false, accounts: [], basis: "no account with the preferred code and no account of the fallback account_type(s) exists for this tenant — cannot be determined without a product decision (seed a coded inventory account)" };
}
