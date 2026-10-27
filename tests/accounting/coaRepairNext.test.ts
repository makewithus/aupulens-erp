import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { seedNewChartOfAccounts } from "@/lib/accounting/coa-feature-seeder";
import { planCoaRepair, applyCoaRepair } from "@/lib/accounting/coaRepair";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
const userId = String(new mongoose.Types.ObjectId());
beforeAll(async()=>{ await mongoose.connect(process.env.MONGODB_URI!); await Promise.all([Account.init(),JournalEntry.init()]); });
afterAll(async()=>{await mongoose.connection.dropDatabase();await mongoose.disconnect();});
describe("AUP-005: dry-run-first classification repair",()=>{
 it("preserves posted history and account IDs, repairs explicitly, and safely reruns",async()=>{
  await ensureChartOfAccounts("repair-a",userId);
  const bank=await Account.findOne({tenantId:"repair-a",code:"1120"});const revenue=await Account.findOne({tenantId:"repair-a",code:"4100"});
  await createPostedJournalEntry({tenantId:"repair-a",createdBy:userId,header:{name:"REPAIR-EVENT",date:new Date(),journalType:"general"},voucherType:"journal",lineIds:[{accountId:bank!._id,debit:100,credit:0,label:"Bank"},{accountId:revenue!._id,debit:0,credit:100,label:"Revenue"}]});
  await Account.updateOne({_id:revenue!._id},{$set:{internal_group:"off_balance",account_type:"off_balance"}});
  const history=await JournalEntry.find({tenantId:"repair-a"}).lean();
  const before=await planCoaRepair("repair-a"); expect(before.changes).toHaveLength(1);expect(before.changes[0].postedLineReferences).toBe(1);
  expect((await Account.findById(revenue!._id))?.internal_group).toBe("off_balance");
  await expect(applyCoaRepair({tenantId:"repair-a",confirmedTenantId:"foreign",execute:true,fingerprint:before.fingerprint})).rejects.toThrow("matching tenant");
  const result=await applyCoaRepair({tenantId:"repair-a",confirmedTenantId:"repair-a",execute:true,fingerprint:before.fingerprint});expect(result.applied).toBe(1);
  expect(await JournalEntry.find({tenantId:"repair-a"}).lean()).toEqual(history);
  expect((await Account.findById(revenue!._id))?.internal_group).toBe("income");
  const again=await planCoaRepair("repair-a");expect(again.changes).toHaveLength(0);
  expect((await applyCoaRepair({tenantId:"repair-a",confirmedTenantId:"repair-a",execute:true,fingerprint:again.fingerprint})).applied).toBe(0);
 });
 it("blocks unknown accounts, ambiguous duplicates and stale proposals without merging",async()=>{
  await Account.create([{tenantId:"repair-b",code:"custom-1",name:"Legacy Duplicate",internal_group:"off_balance",account_type:"off_balance"},{tenantId:"repair-b",code:"custom-2",name:"Legacy Duplicate",internal_group:"asset",account_type:"asset_current"}]);
  const plan=await planCoaRepair("repair-b");expect(plan.duplicates).toHaveLength(1);expect(plan.blockers.length).toBeGreaterThan(1);
  await expect(applyCoaRepair({tenantId:"repair-b",confirmedTenantId:"repair-b",execute:true,fingerprint:plan.fingerprint})).rejects.toThrow("manual");
  await Account.updateOne({tenantId:"repair-b",code:"custom-2"},{$set:{description:"Changed after proposal"}});
  await expect(applyCoaRepair({tenantId:"repair-b",confirmedTenantId:"repair-b",execute:true,fingerprint:plan.fingerprint})).rejects.toThrow("stale");
  expect(await Account.countDocuments({tenantId:"repair-b"})).toBe(2);
 });
 it.each(["base-first","feature-first"])("keeps specific retained earnings/depreciation types and no duplicates when seeding %s twice",async order=>{
  const tenantId=`repair-${order}`;
  if(order==="base-first")await ensureChartOfAccounts(tenantId,userId);
  await seedNewChartOfAccounts(tenantId,userId);await ensureChartOfAccounts(tenantId,userId);
  await seedNewChartOfAccounts(tenantId,userId);await ensureChartOfAccounts(tenantId,userId);
  expect((await Account.findOne({tenantId,code:"3200"}))?.account_type).toBe("equity_unaffected");
  expect((await Account.findOne({tenantId,code:"5300"}))?.account_type).toBe("expense_depreciation");
  for(const code of ["1200","2100","3200"])expect(await Account.countDocuments({tenantId,code})).toBe(1);
 });
});
