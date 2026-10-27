import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
const m=vi.hoisted(()=>({session:null as any}));
vi.mock("@/auth",()=>({auth:async()=>m.session}));
vi.mock("@/lib/db",()=>({default:async()=>mongoose.connection}));
import Account from "@/models/finance/Account";
import Entry from "@/models/finance/JournalEntry";
import Settings from "@/models/finance/AccountingSettings";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { PATCH } from "@/app/api/finance/journal-entries/[id]/route";
const actor=String(new mongoose.Types.ObjectId());let lines:any[];
const call=(id:string,body:any)=>PATCH(new NextRequest(`http://localhost/api/finance/journal-entries/${id}`,{method:"PATCH",body:JSON.stringify(body)}),{params:Promise.resolve({id})});
beforeAll(async()=>{
 await mongoose.connect(process.env.MONGODB_URI!);await Promise.all([Account.init(),Entry.init(),Settings.init()]);
 await ensureChartOfAccounts("policy-next",actor);
 await Settings.create({tenantId:"policy-next",journals:{approvalsEnabled:true,approvalThresholdAmount:50,approverRole:"admin"}});
 const bank=await Account.findOne({tenantId:"policy-next",code:"1120"}),income=await Account.findOne({tenantId:"policy-next",code:"4100"});
 lines=[{accountId:bank!._id,debit:100,credit:0,label:"Bank"},{accountId:income!._id,debit:0,credit:100,label:"Revenue"}];
});
afterAll(async()=>{await mongoose.connection.dropDatabase();await mongoose.disconnect();});
describe("AUP-004: configured policy with real semantic/period/account checks",()=>{
 it("enforces configured approver role and persists the entire authorized lifecycle",async()=>{
  m.session={user:{id:actor,tenantId:"policy-next",role:"finance"}};
  const entry=await Entry.create({tenantId:"policy-next",createdBy:actor,header:{name:"POLICY-NEXT",date:new Date(),journalType:"general"},lineIds:lines,status:"draft",voucherStatus:"draft",approvalRequired:false});
  const id=String(entry._id);
  expect((await call(id,{voucherStatus:"validated"})).status).toBe(200);
  expect((await call(id,{voucherStatus:"approved"})).status).toBe(400);
  expect((await call(id,{voucherStatus:"pending_approval"})).status).toBe(200);
  expect((await call(id,{voucherStatus:"approved"})).status).toBe(400);
  m.session.user.role="admin";expect((await call(id,{voucherStatus:"approved"})).status).toBe(200);
  const responses=await Promise.all([call(id,{voucherStatus:"posted"}),call(id,{voucherStatus:"posted"})]);
  expect(responses.filter(r=>r.status===200)).toHaveLength(1);
  expect(responses.filter(r=>[400,409].includes(r.status))).toHaveLength(1);
  const posted=await Entry.findById(id).lean();expect(posted?.voucherStatus).toBe("posted");expect(posted?.approvalDetails?.approvedBy?.toString()).toBe(actor);
 });
 it("rejects foreign account references before validation and leaves the draft untouched",async()=>{
  const foreign=await Account.create({tenantId:"foreign-policy",code:"foreign",name:"Foreign",internal_group:"income",account_type:"income"});
  const entry=await Entry.create({tenantId:"policy-next",createdBy:actor,header:{name:"FOREIGN-POLICY",date:new Date(),journalType:"general"},lineIds:[lines[0],{...lines[1],accountId:foreign._id}],status:"draft",voucherStatus:"draft"});
  m.session={user:{id:actor,tenantId:"policy-next",role:"admin"}};
  expect((await call(String(entry._id),{voucherStatus:"validated"})).status).toBe(400);
  expect((await Entry.findById(entry._id))?.voucherStatus).toBe("draft");
 });
});
