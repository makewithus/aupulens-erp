import mongoose from "mongoose";
import JournalEntry from "@/models/finance/JournalEntry";
import Account from "@/models/finance/Account";
import { DOCUMENT_STATUS, VOUCHER_STATUS, VOUCHER_TYPE } from "@/lib/constants/statuses";
import { createPostedJournalEntry } from "@/lib/accounting/posting";

export async function syncAssetCapitalizationEntry({
  tenantId,
  asset,
  userId,
}: {
  tenantId: string;
  asset: any;
  userId?: string;
}): Promise<any> {
  const isRunning = asset.status === "running" || asset.status === "posted";
  const ref = `CAP/${asset._id}`;

  if (!isRunning) {
    // If not running, remove any existing capitalization journal entry
    await JournalEntry.deleteMany({ tenantId, "header.ref": ref });
    return null;
  }

  // Find asset account
  let assetAccId = asset.accounts?.assetAccountId;
  if (!assetAccId) {
    const defaultFixedAsset = await Account.findOne({ tenantId, code: "1400" });
    if (defaultFixedAsset) assetAccId = defaultFixedAsset._id;
  }

  // Find funding account (credit side)
  let fundingAccId = asset.accounts?.fundingAccountId;
  if (!fundingAccId) {
    // Default to Owner/Share Capital (3100) or Bank Current Account (1120)
    const capitalAcc = await Account.findOne({
      tenantId,
      $or: [
        { code: "3100" },
        { code: "3000" },
        { account_type: "equity" },
        { internal_group: "equity" },
      ],
    });
    if (capitalAcc) {
      fundingAccId = capitalAcc._id;
    } else {
      const bankAcc = await Account.findOne({
        tenantId,
        $or: [
          { code: "1120" },
          { code: "1100" },
          { account_type: "asset_cash" },
        ],
      });
      if (bankAcc) fundingAccId = bankAcc._id;
    }
  }

  if (!assetAccId || !fundingAccId) {
    console.warn("Cannot post asset capitalization: missing asset or funding account");
    return null;
  }

  const amount = Number(asset.originalValue) || 0;
  if (amount <= 0) return null;

  // Check if existing entry exists
  const existing = await JournalEntry.findOne({ tenantId, "header.ref": ref });
  if (existing) {
    // Update existing entry lines
    existing.header.date = asset.purchaseDate ? new Date(asset.purchaseDate) : new Date();
    existing.status = DOCUMENT_STATUS.POSTED;
    existing.voucherStatus = VOUCHER_STATUS.POSTED;
    existing.approvalRequired = false;
    existing.ledgerUpdatedAt = new Date();
    existing.lineIds = [
      {
        accountId: assetAccId,
        label: `Asset Capitalization — ${asset.name}`,
        debit: amount,
        credit: 0,
      },
      {
        accountId: fundingAccId,
        label: `Acquisition funding for ${asset.name}`,
        debit: 0,
        credit: amount,
      },
    ] as any;
    existing.totals = {
      amountUntaxed: amount,
      amountTax: 0,
      amountTotal: amount,
      currencyId: "INR",
    } as any;
    await existing.save();
    return existing;
  }

  // Generate clean entry name
  const safeName = (asset.name || "Asset").replace(/[^a-zA-Z0-9]/g, "-").slice(0, 20);
  const baseName = `CAP/${safeName}/${String(asset._id).slice(-6)}`;

  return await createPostedJournalEntry({
    tenantId,
    createdBy: userId,
    header: {
      name: baseName,
      date: asset.purchaseDate ? new Date(asset.purchaseDate) : new Date(),
      ref,
      journalType: "general",
    },
    voucherType: VOUCHER_TYPE.JOURNAL,
    lineIds: [
      {
        accountId: assetAccId,
        label: `Asset Capitalization — ${asset.name}`,
        debit: amount,
        credit: 0,
      },
      {
        accountId: fundingAccId,
        label: `Acquisition funding for ${asset.name}`,
        debit: 0,
        credit: amount,
      },
    ],
    totals: {
      amountUntaxed: amount,
      amountTax: 0,
      amountTotal: amount,
    },
  });
}

export async function removeAssetCapitalizationEntry({
  tenantId,
  assetId,
}: {
  tenantId: string;
  assetId: string;
}): Promise<void> {
  await JournalEntry.deleteMany({ tenantId, "header.ref": `CAP/${assetId}` });
}
