import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
const m=vi.hoisted(()=>({session:null as any}));
vi.mock("@/auth",()=>({auth:async()=>m.session}));
vi.mock("@/lib/db",()=>({default:async()=>mongoose.connection}));
vi.mock("@/lib/crm/aiScoring",()=>({scoreLeadWithAi:async()=>({})}));
import Account from "@/models/crm/Account";
import Task from "@/models/crm/Task";
import { PUT as accountPut } from "@/app/api/crm/accounts/[id]/route";
import { PUT as taskPut } from "@/app/api/crm/tasks/[id]/route";
import { crmEditableFields } from "@/lib/crm/editableFields";
const user=String(new mongoose.Types.ObjectId());
beforeAll(async()=>{await mongoose.connect(process.env.MONGODB_URI!);await Promise.all([Account.init(),Task.init()]);});
afterAll(async()=>{await mongoose.connection.dropDatabase();await mongoose.disconnect();});
const req=(body:any)=>new NextRequest("http://localhost/api/crm/test",{method:"PUT",body:JSON.stringify(body)});
describe("AUP-003: explicit CRM contracts and persisted boundaries",()=>{
 it.each(["account","lead","task"] as const)("strips authority/derived metadata from %s updates",kind=>{
  const edit=crmEditableFields(kind,{tenantId:"foreign",createdBy:user,approvalDetails:{approved:true},converted_at:new Date(),completed_at:new Date(),lead_score:100,lifetime_value:99999,account_health_score:100,$set:{tenantId:"foreign"},"tenantId.foo":"foreign"});
  expect(edit).toEqual({});
 });
 it("persists valid account edits while leaving derived fields, tenant and foreign document unchanged",async()=>{
  m.session={user:{id:user,tenantId:"crm-next-a",role:"admin"}};
  const own=await Account.create({tenantId:"crm-next-a",company_name:"Own",createdBy:user,lifetime_value:10});
  const foreign=await Account.create({tenantId:"crm-next-b",company_name:"Foreign",createdBy:user});
  const response=await accountPut(req({company_name:"Edited",tenantId:"crm-next-b",createdBy:String(foreign._id),lifetime_value:100000,account_health_score:100}),{params:Promise.resolve({id:String(own._id)})});
  expect(response.status).toBe(200);
  expect(await Account.findById(own._id).lean()).toMatchObject({tenantId:"crm-next-a",company_name:"Edited",lifetime_value:10});
  expect((await Account.findById(foreign._id))?.company_name).toBe("Foreign");
  expect((await accountPut(req({company_name:"Intrusion"}),{params:Promise.resolve({id:String(foreign._id)})})).status).toBe(404);
 });
 it("rejects denied task edits and computes completion time on an authorized edit",async()=>{
  const task=await Task.create({tenantId:"crm-next-a",title:"Original",assigned_to_id:user,due_date:new Date(),createdBy:user,status:"Pending"});
  m.session={user:{id:user,tenantId:"crm-next-a",role:"hr"}};
  expect((await taskPut(req({title:"Intrusion"}),{params:Promise.resolve({id:String(task._id)})})).status).toBe(403);
  m.session.user.role="admin";
  expect((await taskPut(req({title:"Edited",status:"Completed",completed_at:"2000-01-01"}),{params:Promise.resolve({id:String(task._id)})})).status).toBe(200);
  const result=await Task.findById(task._id);expect(result?.title).toBe("Edited");expect(result?.completed_at?.getUTCFullYear()).toBe(2026);
 });
});
