import CrmQuote from "@/models/crm/Quote";
import CrmApprovalRequest from "@/models/crm/ApprovalRequest";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import User from "@/models/User";

/**
 * Compute the AVERAGE line-item discount percent across all line items.
 * This is used to drive the three-tier approval threshold:
 *   <= 5%  → Auto Approve
 *   > 5%   → Manager Approval Required
 *   > 20%  → Executive Approval Required
 */
function computeAverageDiscount(quote: any): number {
  if (!quote.line_items || quote.line_items.length === 0) return 0;
  const sum = quote.line_items.reduce(
    (acc: number, item: any) => acc + (item.discount_percent || 0),
    0
  );
  return sum / quote.line_items.length;
}

/**
 * Determine approval tier based on average discount.
 */
export function getApprovalTier(
  avgDiscount: number
): "auto" | "manager" | "executive" {
  if (avgDiscount <= 5) return "auto";
  if (avgDiscount <= 20) return "manager";
  return "executive";
}

/**
 * Core approval router. Called when a quote is submitted for approval.
 * Mutates quote.status and creates CrmApprovalRequest + audit log records.
 */
export async function processQuoteApproval(quote: any, requesterId: string) {
  const avgDiscount = computeAverageDiscount(quote);
  const tier = getApprovalTier(avgDiscount);

  // ── Auto Approve ──────────────────────────────────────────────
  if (tier === "auto") {
    quote.status = "Approved";
    quote.approved_by_id = requesterId;
    await quote.save();

    await CrmAuditLog.create({
      tenantId: quote.tenantId,
      user_id: requesterId,
      action: "approved",
      record_type: "Quote",
      record_id: quote._id,
      new_value: "Approved (auto — discount ≤ 5%)",
      timestamp: new Date(),
    });

    return {
      status: "Approved",
      tier: "auto",
      message: `Auto-approved. Average discount (${avgDiscount.toFixed(1)}%) is within the ≤5% threshold.`,
    };
  }

  // ── Find approver by role ─────────────────────────────────────
  const requiredRole = tier === "executive" ? "Executive" : "Manager";

  // Try to find a user with the required role in the same tenant.
  // Fall back to Admin if no Manager/Executive is configured.
  let approver = await User.findOne({
    tenantId: quote.tenantId,
    role: requiredRole,
  });

  if (!approver) {
    approver = await User.findOne({
      tenantId: quote.tenantId,
      role: "Admin",
    });
  }

  if (!approver) {
    throw new Error(
      `No ${requiredRole} or Admin user found to route approval for tenant ${quote.tenantId}.`
    );
  }

  // ── Mark quote as pending ─────────────────────────────────────
  quote.status = "Pending Approval";
  await quote.save();

  // ── Create approval request record ───────────────────────────
  const approvalRequest = await CrmApprovalRequest.create({
    tenantId: quote.tenantId,
    type: "Quote",
    requested_by_id: requesterId,
    approver_id: approver._id,
    linked_record_type: "Quote",
    linked_record_id: quote._id,
    status: "Pending",
    request_notes: `${requiredRole} approval required. Average discount is ${avgDiscount.toFixed(1)}% (threshold: ${tier === "executive" ? ">20%" : ">5%"}).`,
    createdBy: requesterId,
  });

  // ── Audit log ─────────────────────────────────────────────────
  await CrmAuditLog.create({
    tenantId: quote.tenantId,
    user_id: requesterId,
    action: "status_changed",
    record_type: "Quote",
    record_id: quote._id,
    old_value: "Draft",
    new_value: "Pending Approval",
    timestamp: new Date(),
  });

  return {
    status: "Pending Approval",
    tier,
    approvalRequestId: approvalRequest._id,
    approverName: approver.name,
    message: `Routed to ${requiredRole} (${approver.name}) for approval. Avg discount: ${avgDiscount.toFixed(1)}%.`,
  };
}

/**
 * Approve a quote that is in 'Pending Approval'.
 * Called by the approver via the /approve route.
 */
export async function approveQuote(
  quote: any,
  approverId: string,
  notes?: string
) {
  // Update any pending approval requests for this quote targeting this approver
  const pendingApprovals = await CrmApprovalRequest.find({
    linked_record_id: quote._id,
    status: "Pending",
    approver_id: approverId,
  });

  for (const approval of pendingApprovals) {
    approval.status = "Approved";
    if (notes) approval.decision_notes = notes;
    approval.decided_at = new Date();
    await approval.save();
  }

  // Also close any pending approvals regardless of approver (admin override path)
  if (pendingApprovals.length === 0) {
    const anyPending = await CrmApprovalRequest.findOne({
      linked_record_id: quote._id,
      status: "Pending",
    });
    if (anyPending) {
      anyPending.status = "Approved";
      if (notes) anyPending.decision_notes = notes;
      anyPending.decided_at = new Date();
      await anyPending.save();
    }
  }

  quote.status = "Approved";
  quote.approved_by_id = approverId;
  await quote.save();

  await CrmAuditLog.create({
    tenantId: quote.tenantId,
    user_id: approverId,
    action: "approved",
    record_type: "Quote",
    record_id: quote._id,
    new_value: notes || "Approved",
    timestamp: new Date(),
  });

  return quote;
}

/**
 * Reject a quote that is in 'Pending Approval'.
 * Called by the approver via the /reject route.
 */
export async function rejectQuote(
  quote: any,
  approverId: string,
  notes?: string
) {
  const pendingApprovals = await CrmApprovalRequest.find({
    linked_record_id: quote._id,
    status: "Pending",
  });

  for (const approval of pendingApprovals) {
    approval.status = "Rejected";
    if (notes) approval.decision_notes = notes;
    approval.decided_at = new Date();
    await approval.save();
  }

  quote.status = "Rejected";
  await quote.save();

  await CrmAuditLog.create({
    tenantId: quote.tenantId,
    user_id: approverId,
    action: "rejected",
    record_type: "Quote",
    record_id: quote._id,
    new_value: notes || "Rejected",
    timestamp: new Date(),
  });

  return quote;
}

/**
 * Request changes on a pending quote (sends it back to Draft).
 */
export async function requestChanges(
  quote: any,
  approverId: string,
  notes: string
) {
  const pendingApprovals = await CrmApprovalRequest.find({
    linked_record_id: quote._id,
    status: "Pending",
  });

  for (const approval of pendingApprovals) {
    approval.status = "Changes Requested";
    approval.decision_notes = notes;
    approval.decided_at = new Date();
    await approval.save();
  }

  quote.status = "Draft";
  await quote.save();

  await CrmAuditLog.create({
    tenantId: quote.tenantId,
    user_id: approverId,
    action: "status_changed",
    record_type: "Quote",
    record_id: quote._id,
    old_value: "Pending Approval",
    new_value: `Draft (Changes Requested): ${notes}`,
    timestamp: new Date(),
  });

  return quote;
}
