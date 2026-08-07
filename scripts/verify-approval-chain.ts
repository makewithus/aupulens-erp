/**
 * Part 2.2 live verification: a configurable multi-step approval policy routes a
 * quote through its chain step-by-step, only finalizing after the LAST step.
 * (Manager/Executive aren't User-enum roles, so both steps fall back to an Admin
 * approver — the point here is the CHAIN ADVANCEMENT, not the role lookup.)
 *
 * Run: npx tsx scripts/verify-approval-chain.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "zz-approval-verify";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const User = (await import("../models/User")).default;
  const CrmQuote = (await import("../models/crm/Quote")).default;
  const CrmApprovalPolicy = (await import("../models/crm/ApprovalPolicy")).default;
  const CrmApprovalRequest = (await import("../models/crm/ApprovalRequest")).default;
  const { processQuoteApproval, approveQuote } = await import("../lib/crm/approvalEngine");

  // Clean slate for the throwaway tenant.
  await Promise.all([
    User.deleteMany({ tenantId: TENANT }),
    CrmQuote.deleteMany({ tenantId: TENANT }),
    CrmApprovalPolicy.deleteMany({ tenantId: TENANT }),
    CrmApprovalRequest.deleteMany({ tenantId: TENANT }),
  ]);

  const admin = await User.create({ tenantId: TENANT, name: "Approver Admin", email: "approver@zz.example", phone: "0000000000", password: "secret123", role: "admin" });

  const policy = await CrmApprovalPolicy.create({
    tenantId: TENANT, entity: "Quote", name: "Two-step discount chain", enabled: true, createdBy: admin._id,
    steps: [
      { order: 1, approverRole: "Manager", minAvgDiscountPercent: 5 },
      { order: 2, approverRole: "Executive", minAvgDiscountPercent: 20 },
    ],
  });
  console.log(`Policy "${policy.name}" with ${policy.steps.length} steps created.`);

  const quote = await CrmQuote.create({
    tenantId: TENANT, quote_number: "Q-VERIFY-1",
    opportunity_id: new mongoose.Types.ObjectId(), account_id: new mongoose.Types.ObjectId(), owner_id: admin._id,
    validity_date: new Date(Date.now() + 7 * 864e5), status: "Draft", createdBy: admin._id,
    line_items: [{ item_name: "Widget", quantity: 1, unit_price: 1000, discount_percent: 30 }],
  });

  // Submit → should route to step 1 of 2.
  const submit = await processQuoteApproval(quote, String(admin._id));
  console.log(`1. Submit → status=${submit.status}, ${submit.message}`);
  console.log(`   quote.status now: ${(await CrmQuote.findById(quote._id).lean() as any).status} (expected Pending Approval)`);

  // Approve step 1 → should advance to step 2, quote STILL pending.
  let q = await CrmQuote.findById(quote._id);
  await approveQuote(q, String(admin._id));
  const afterStep1 = await CrmQuote.findById(quote._id).lean() as any;
  const pendingAfter1 = await CrmApprovalRequest.countDocuments({ linked_record_id: quote._id, status: "Pending" });
  console.log(`2. Approve step 1 → quote.status=${afterStep1.status} (expected still Pending Approval), pending requests=${pendingAfter1} (expected 1 — step 2)`);

  // Approve step 2 → final approval.
  q = await CrmQuote.findById(quote._id);
  await approveQuote(q, String(admin._id));
  const afterStep2 = await CrmQuote.findById(quote._id).lean() as any;
  console.log(`3. Approve step 2 → quote.status=${afterStep2.status} (expected Approved)`);

  const pass = afterStep1.status === "Pending Approval" && pendingAfter1 === 1 && afterStep2.status === "Approved";
  console.log(pass ? "PASS: chain advanced step-by-step, finalized only after the last step" : "FAIL");

  // Cleanup.
  await Promise.all([
    User.deleteMany({ tenantId: TENANT }),
    CrmQuote.deleteMany({ tenantId: TENANT }),
    CrmApprovalPolicy.deleteMany({ tenantId: TENANT }),
    CrmApprovalRequest.deleteMany({ tenantId: TENANT }),
  ]);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
