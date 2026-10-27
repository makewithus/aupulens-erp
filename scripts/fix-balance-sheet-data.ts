import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Account from "../models/finance/Account";
import AccountType from "../models/finance/AccountType";
import Asset from "../models/finance/Asset";
import JournalEntry from "../models/finance/JournalEntry";
import { syncAssetCapitalizationEntry } from "../lib/accounting/assetPosting";
import { buildPostedJournalReport } from "../lib/accounting/reports";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const tenantId = "default-tenant";
  console.log("=== Running Balance Sheet Data Fix for Tenant:", tenantId, "===");

  // Handle unique constraint on { tenantId, accountName }:
  // An orphaned un-coded account 6a456303a6d2a9e956d64aac has name 'Accounts Payable' with 0 entries.
  const unCodedAP = await Account.findById("6a456303a6d2a9e956d64aac");
  if (unCodedAP) {
    unCodedAP.name = "Accounts Payable (Legacy)";
    unCodedAP.accountName = "Accounts Payable (Legacy)";
    await unCodedAP.save();
    console.log("Renamed orphaned un-coded AP account to avoid unique index conflict.");
  }

  // 1. Fix Account 2100: It was mistakenly renamed to 'GST Payable'.
  // 2100 is standard Accounts Payable for vendor bills.
  const acc2100 = await Account.findOne({ tenantId, code: "2100" });
  if (acc2100) {
    console.log("Fixing Account 2100 from:", acc2100.name, "to: Accounts Payable");
    acc2100.name = "Accounts Payable";
    acc2100.accountName = "Accounts Payable";
    acc2100.account_type = "liability_payable";
    acc2100.internal_group = "liability";
    await acc2100.save();
  }

  // 2. Remove bogus test entry JRN/2026/0002 that caused the ₹2.00 entry
  const deletedJrn = await JournalEntry.deleteOne({ tenantId, "header.name": "JRN/2026/0002" });
  console.log("Deleted bogus JRN/2026/0002:", deletedJrn.deletedCount);

  // 3. Backfill internal_group and account_type on any accounts in default-tenant missing them
  const allAccounts = await Account.find({ tenantId });
  const accountTypes = await AccountType.find({ tenantId }).lean();
  const typeMap = new Map(accountTypes.map((t: any) => [String(t._id), t]));

  let backfilledCount = 0;
  for (const acc of allAccounts) {
    let changed = false;
    const typeObj = acc.accountType ? typeMap.get(String(acc.accountType)) : null;

    if (typeObj?.segment) {
      const seg = String(typeObj.segment).toLowerCase();
      if (seg.includes("asset")) {
        if (!acc.internal_group) { acc.internal_group = "asset"; changed = true; }
        if (!acc.account_type) {
          acc.account_type = (seg.includes("non current") || seg.includes("fixed")) ? "asset_fixed" : "asset_current";
          changed = true;
        }
      } else if (seg.includes("liability")) {
        if (!acc.internal_group) { acc.internal_group = "liability"; changed = true; }
        if (!acc.account_type) {
          acc.account_type = (seg.includes("non current") || seg.includes("long term")) ? "liability_non_current" : "liability_current";
          changed = true;
        }
      } else if (seg.includes("equity")) {
        if (!acc.internal_group) { acc.internal_group = "equity"; changed = true; }
        if (!acc.account_type) { acc.account_type = "equity"; changed = true; }
      } else if (seg.includes("income") || seg.includes("revenue")) {
        if (!acc.internal_group) { acc.internal_group = "income"; changed = true; }
        if (!acc.account_type) { acc.account_type = "income"; changed = true; }
      } else if (seg.includes("expense") || seg.includes("cost")) {
        if (!acc.internal_group) { acc.internal_group = "expense"; changed = true; }
        if (!acc.account_type) { acc.account_type = "expense"; changed = true; }
      }
    }

    if (!acc.internal_group) {
      const code = String(acc.code || acc.accountCode || "");
      const name = (acc.name || acc.accountName || "").toLowerCase();
      if (code.startsWith("1") || name.includes("bank") || name.includes("cash") || name.includes("receivable") || name.includes("asset")) {
        acc.internal_group = "asset";
        changed = true;
      } else if (code.startsWith("2") || name.includes("payable") || name.includes("tax") || name.includes("loan")) {
        acc.internal_group = "liability";
        changed = true;
      } else if (code.startsWith("3") || name.includes("capital") || name.includes("equity")) {
        acc.internal_group = "equity";
        changed = true;
      } else if (code.startsWith("4") || name.includes("revenue") || name.includes("income")) {
        acc.internal_group = "income";
        changed = true;
      } else if (code.startsWith("5") || code.startsWith("6") || name.includes("expense")) {
        acc.internal_group = "expense";
        changed = true;
      }
    }

    if (!acc.account_type) {
      const code = String(acc.code || acc.accountCode || "");
      const name = (acc.name || acc.accountName || "").toLowerCase();
      if (acc.internal_group === "asset") {
        if (code.startsWith("11") || name.includes("bank") || name.includes("cash")) {
          acc.account_type = "asset_cash";
        } else if (code.startsWith("14") || code.startsWith("15") || name.includes("machinery") || name.includes("equipment") || name.includes("truck") || name.includes("vehicle") || name.includes("fixed asset")) {
          acc.account_type = "asset_fixed";
        } else if (code === "1200" || name.includes("receivable")) {
          acc.account_type = "asset_receivable";
        } else {
          acc.account_type = "asset_current";
        }
        changed = true;
      } else if (acc.internal_group === "liability") {
        if (code === "2100" || name.includes("accounts payable")) {
          acc.account_type = "liability_payable";
        } else if (code.startsWith("25") || code.startsWith("26") || code.startsWith("27") || name.includes("loan") || name.includes("borrowing")) {
          acc.account_type = "liability_non_current";
        } else {
          acc.account_type = "liability_current";
        }
        changed = true;
      } else if (acc.internal_group === "equity") {
        acc.account_type = "equity";
        changed = true;
      }
    }

    if (changed) {
      await acc.save();
      backfilledCount++;
    }
  }
  console.log(`Backfilled internal_group/account_type on ${backfilledCount} accounts.`);

  // 4. Ensure distinct Fixed Asset accounts exist for the two assets
  // Delivery Truck 01 (1410) & Production Machinery (1420)
  let truckAcc = await Account.findOne({ tenantId, code: "1410" });
  if (!truckAcc) {
    truckAcc = await Account.create({
      tenantId,
      code: "1410",
      name: "Delivery Truck 01",
      accountCode: "1410",
      accountName: "Delivery Truck 01",
      account_type: "asset_fixed",
      internal_group: "asset",
      isActive: true,
    });
    console.log("Created account 1410 - Delivery Truck 01");
  }

  let machineryAcc = await Account.findOne({ tenantId, code: "1420" });
  if (!machineryAcc) {
    machineryAcc = await Account.create({
      tenantId,
      code: "1420",
      name: "Production Machinery",
      accountCode: "1420",
      accountName: "Production Machinery",
      account_type: "asset_fixed",
      internal_group: "asset",
      isActive: true,
    });
    console.log("Created account 1420 - Production Machinery");
  }

  // Ensure funding account exists (Owner/Share Capital 3100)
  let capitalAcc = await Account.findOne({ tenantId, code: "3100" });
  if (!capitalAcc) {
    capitalAcc = await Account.findOne({ tenantId, code: "3000" });
  }

  // 5. Update Asset documents and capitalize them
  const truckAsset = await Asset.findOne({ tenantId, name: "Delivery Truck 01" });
  if (truckAsset) {
    truckAsset.accounts = {
      ...(truckAsset.accounts || {}),
      assetAccountId: truckAcc._id,
      fundingAccountId: capitalAcc?._id,
    } as any;
    truckAsset.status = "running";
    await truckAsset.save();
    const jrn = await syncAssetCapitalizationEntry({ tenantId, asset: truckAsset });
    console.log("Capitalized Delivery Truck 01:", jrn ? jrn.header?.name : "null");
  }

  const machineryAsset = await Asset.findOne({ tenantId, name: "Production Machinery" });
  if (machineryAsset) {
    machineryAsset.accounts = {
      ...(machineryAsset.accounts || {}),
      assetAccountId: machineryAcc._id,
      fundingAccountId: capitalAcc?._id,
    } as any;
    machineryAsset.status = "running";
    await machineryAsset.save();
    const jrn = await syncAssetCapitalizationEntry({ tenantId, asset: machineryAsset });
    console.log("Capitalized Production Machinery:", jrn ? jrn.header?.name : "null");
  }


  // 6. Verify with buildPostedJournalReport
  const report = await buildPostedJournalReport({
    tenantId,
    endDate: new Date("2026-10-25T23:59:59.999Z"),
  });

  console.log("\n=== VERIFICATION REPORT ===");
  console.log("Total Assets:", report.asset.total);
  console.log("  Current Assets Total:", report.asset.current?.total);
  console.log("  Non-Current Assets Total:", report.asset.nonCurrent?.total);
  console.log("  Non-Current Asset Accounts:", Object.values(report.asset.nonCurrent?.accounts || {}).map(a => `${a.name} (${a.code}): ₹${a.amount}`));

  console.log("\nTotal Liabilities:", report.liability.total);
  console.log("  Current Liabilities Total:", report.liability.current?.total);
  console.log("  Current Liability Accounts:", Object.values(report.liability.current?.accounts || {}).map(a => `${a.name} (${a.code}): ₹${a.amount}`));
  console.log("  Non-Current Liabilities Total:", report.liability.nonCurrent?.total);

  console.log("\nTotal Equity:", report.equity.total);
  const liabilitiesAndEquity = report.liability.total + report.equity.total;
  console.log("Liabilities + Equity:", liabilitiesAndEquity);
  console.log("Difference (Out of balance):", Math.abs(report.asset.total - liabilitiesAndEquity));
  console.log("BALANCED?", Math.abs(report.asset.total - liabilitiesAndEquity) < 0.01 ? "YES! PERFECTLY BALANCED" : "NO");

  await mongoose.disconnect();
}

main().catch(console.error);
