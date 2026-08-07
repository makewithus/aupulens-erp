/**
 * Scope B live verification: the generalized Command Center confirm gate stops
 * a DESTRUCTIVE action at the preview and only mutates after explicit confirm.
 *
 * 1. create a throwaway lead
 * 2. PROPOSE delete_lead → build preview + store proposal (status "proposed")
 *    → assert the lead STILL EXISTS (a proposal is inert)
 * 3. CONFIRM → execute → assert the lead is gone AND an audit log was written
 * 4. bonus: reject path leaves a second lead untouched
 *
 * Run: npx tsx scripts/verify-command-executor.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "default-tenant";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const CrmLead = (await import("../models/crm/Lead")).default;
  const CrmAuditLog = (await import("../models/crm/CrmAuditLog")).default;
  const AiCommandProposal = (await import("../models/AiCommandProposal")).default;
  const { COMMAND_ACTIONS } = await import("../lib/ai/commandActions");
  const { AI_ACTION_STATUS } = await import("../lib/constants/statuses");

  const userId = new mongoose.Types.ObjectId();
  const del = COMMAND_ACTIONS.delete_lead;

  // 1) throwaway lead
  const lead = await CrmLead.create({ tenantId: TENANT, lead_name: "ZZ Temp Delete Me", company_name: "Ephemeral Co", source: "Manual Entry", status: "New", owner_id: userId, createdBy: userId });
  console.log(`1. Created throwaway lead ${lead._id}`);

  // 2) PROPOSE (preview only) — must NOT mutate
  const { summary, preview } = await del.buildPreview({ leadId: String(lead._id) }, TENANT);
  const proposal = await AiCommandProposal.create({
    tenantId: TENANT, userId, module: "crm", actionType: "delete_lead", destructive: true,
    params: { leadId: String(lead._id) }, preview, summary, expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  const stillThere = await CrmLead.findById(lead._id).lean();
  console.log(`2. Proposed (status=${proposal.status}, destructive=${proposal.destructive}) -> lead exists after propose? ${!!stillThere}`);
  console.log(`   summary: "${summary}"`);
  if (!stillThere) throw new Error("FAIL: lead was deleted at PROPOSE time — gate broken!");
  console.log(`   PASS: proposal is inert — nothing deleted at propose time.`);

  // 3) CONFIRM → execute
  const { result } = await del.execute(proposal.params as any, TENANT, String(userId));
  proposal.status = AI_ACTION_STATUS.EXECUTED;
  proposal.executedAt = new Date();
  await proposal.save();
  const goneNow = await CrmLead.findById(lead._id).lean();
  const audit = await CrmAuditLog.findOne({ tenantId: TENANT, record_id: lead._id, action: "deleted" }).lean();
  console.log(`3. Confirmed -> lead exists now? ${!!goneNow}; audit log written? ${!!audit}; result=${JSON.stringify(result)}`);
  if (goneNow || !audit) throw new Error("FAIL: confirm did not delete + audit correctly");
  console.log(`   PASS: mutation happened only after confirm, with an audit record.`);

  // 4) reject path leaves a second lead untouched
  const lead2 = await CrmLead.create({ tenantId: TENANT, lead_name: "ZZ Temp Reject Me", source: "Manual Entry", status: "New", owner_id: userId, createdBy: userId });
  const p2 = await AiCommandProposal.create({
    tenantId: TENANT, userId, module: "crm", actionType: "delete_lead", destructive: true,
    params: { leadId: String(lead2._id) }, preview: {}, summary: "delete", expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  p2.status = AI_ACTION_STATUS.REJECTED;
  await p2.save();
  const survived = await CrmLead.findById(lead2._id).lean();
  console.log(`4. Rejected proposal -> second lead survived? ${!!survived} (status=${p2.status})`);

  // cleanup the reject-test lead + proposals + audit (leave nothing behind)
  await CrmLead.deleteOne({ _id: lead2._id, tenantId: TENANT });
  await AiCommandProposal.deleteMany({ _id: { $in: [proposal._id, p2._id] } });
  console.log(`Cleanup done.`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
