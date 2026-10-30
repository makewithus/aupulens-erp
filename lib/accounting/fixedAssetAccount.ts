import mongoose from "mongoose";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";

const CONTRA_ASSET_NAME = /accumulated\s+(?:depreciation|amortization)/i;

/** Resolve a selectable fixed-asset ledger for one tenant. */
export async function isFixedAssetAccount(tenantId: string, accountId: unknown) {
  if (!accountId || !mongoose.Types.ObjectId.isValid(String(accountId))) return false;
  const account = await Account.collection.findOne({
    _id: new mongoose.Types.ObjectId(String(accountId)), tenantId,
  }) as (Record<string, any> | null);
  if (!account) return false;

  const name = String(account.name || account.accountName || "");
  if (CONTRA_ASSET_NAME.test(name)) return false;

  // Legacy `type` is not declared in the Mongoose schema, so read the raw
  // document above. Prefer an explicit fixed-asset classification, while
  // allowing known legacy fixed-asset ledgers to override stale equity tags.
  if (account.type === "fixed_asset" || account.account_type === "asset_fixed") return true;

  if (account.accountType) {
    const type = await AccountType.findOne({
      _id: account.accountType,
      tenantId,
    }).select("name segment").lean();
    if (type?.segment === "Fixed Asset" || type?.name === "Fixed Asset" || type?.name === "Intangible Asset") return true;
  }

  const code = String(account.code || account.accountCode || "");
  return /^(14|15)/.test(code) || /\b(machinery|equipment|vehicle|truck|furniture|fixed asset)\b/i.test(name);
}
