import CrmQuote from "@/models/crm/Quote";
import CrmApprovalRequest from "@/models/crm/ApprovalRequest";
import CrmApprovalPolicy, { type IApprovalStep } from "@/models/crm/ApprovalPolicy";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import User from "@/models/auth/User";

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

/** Total amount used for policy amount-thresholds. Falls back to summing lines. */
function computeQuoteTotal(quote: any): number {
  if (typeof quote.total === "number") return quote.total;
  if (typeof quote.grand_total === "number") return quote.grand_total;
  if (!quote.line_items?.length) return 0;
  return quote.line_items.reduce((acc: number, i: any) => acc + (Number(i.line_total) || Number(i.total) || 0), 0);
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

// ── Configurable multi-step policy (6.3) — pure, unit-tested ──────────────────

export interface RecordMetrics { avgDiscountPercent: number; totalAmount: number }

/**
 * Given the record's metrics and a policy's steps, return the ORDERED chain of
 * steps that apply (each threshold, when set, is a lower bound). Pure so the
 * routing logic is testable without a DB.
 */
export function applicableSteps(metrics: RecordMetrics, steps: IApprovalStep[]): IApprovalStep[] {
  return steps
    .filter((s) =>
      (s.minAvgDiscountPercent == null || metrics.avgDiscountPercent >= s.minAvgDiscountPercent) &&
      (s.minAmount == null || metrics.totalAmount >= s.minAmount))
    .sort((a, b) => a.order - b.order);
}

async function findApprover(tenantId: string, role: string) {
  // Policy/legacy roles are free-form labels ("Manager", "Executive", "Admin"),
  // but the User.role enum is lowercase ("admin", "finance", …). Try the exact
  // label, then a case-insensitive match, then fall back to the tenant's admin
  // (lowercase — the real enum value; the old "Admin" lookup never matched).
  return (
    (await User.findOne({ tenantId, role })) ||
    (await User.findOne({ tenantId, role: new RegExp(`^${role}$`, "i") })) ||
    (await User.findOne({ tenantId, role: "admin" }))
  );
}

/** Create the pending request for one step of a policy chain. */
async function createStepRequest(
  quote: any,
  requesterId: string,
  policyId: any,
  step: IApprovalStep,
  stepIndex: number,
  totalSteps: number,
  metrics: RecordMetrics,
) {
  const approver = await findApprover(quote.tenantId, step.approverRole);
  if (!approver) throw new Error(`No ${step.approverRole} or Admin user found to route approval for tenant ${quote.tenantId}.`);

  const request = await CrmApprovalRequest.create({
    tenantId: quote.tenantId,
    type: "Quote",
    requested_by_id: requesterId,
    approver_id: approver._id,
    linked_record_type: "Quote",
    linked_record_id: quote._id,
    status: "Pending",
    request_notes: `${step.approverRole} approval (step ${stepIndex + 1} of ${totalSteps}). Avg discount ${metrics.avgDiscountPercent.toFixed(1)}%, amount ${metrics.totalAmount}.`,
    step_index: stepIndex,
    total_steps: totalSteps,
    approver_role: step.approverRole,
    policy_id: policyId,
    createdBy: requesterId,
  });
  return { request, approver };
}

/**
 * Multi-step approval path (used when the tenant has configured an
 * ApprovalPolicy). Creates the FIRST applicable step's request; the chain
 * advances on each approval (see approveQuote).
 */
async function processPolicyQuoteApproval(quote: any, policy: any, requesterId: string) {
  const metrics: RecordMetrics = { avgDiscountPercent: computeAverageDiscount(quote), totalAmount: computeQuoteTotal(quote) };
  const chain = applicableSteps(metrics, policy.steps);

  if (chain.length === 0) {
    quote.status = "Approved";
    quote.approved_by_id = requesterId;
    await quote.save();
    await CrmAuditLog.create({
      tenantId: quote.tenantId, user_id: requesterId, action: "approved", record_type: "Quote", record_id: quote._id,
      new_value: `Approved (auto — no policy step applies)`, timestamp: new Date(),
    });
    return { status: "Approved", tier: "auto", message: `Auto-approved — no step of policy "${policy.name}" applied.` };
  }

  quote.status = "Pending Approval";
  await quote.save();
  const { request, approver } = await createStepRequest(quote, requesterId, policy._id, chain[0], 0, chain.length, metrics);
  await CrmAuditLog.create({
    tenantId: quote.tenantId, user_id: requesterId, action: "status_changed", record_type: "Quote", record_id: quote._id,
    old_value: "Draft", new_value: "Pending Approval", timestamp: new Date(),
  });
  return {
    status: "Pending Approval",
    tier: chain[0].approverRole,
    approvalRequestId: request._id,
    approverName: approver.name,
    totalSteps: chain.length,
    message: `Routed to ${chain[0].approverRole} (${approver.name}) — step 1 of ${chain.length} in policy "${policy.name}".`,
  };
}

/**
 * Core approval router. Called when a quote is submitted for approval.
 * Uses the tenant's configured ApprovalPolicy when present (multi-step chain);
 * otherwise falls back to the legacy 3-tier behaviour (unchanged) so existing
 * tenants are unaffected.
 */
export async function processQuoteApproval(quote: any, requesterId: string) {
  const policy = await CrmApprovalPolicy.findOne({ tenantId: quote.tenantId, entity: "Quote", enabled: true });
  if (policy && policy.steps?.length) {
    return processPolicyQuoteApproval(quote, policy, requesterId);
  }
  return processLegacyQuoteApproval(quote, requesterId);
}

/** Legacy hardcoded 3-tier router — preserved verbatim for backward compat. */
async function processLegacyQuoteApproval(quote: any, requesterId: string) {
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

  // Uses the shared findApprover so the role lookup is case-insensitive and
  // falls back to the tenant's (lowercase) admin — the old inline `role:"Admin"`
  // fallback never matched the lowercase enum and always threw.
  const approver = await findApprover(quote.tenantId, requiredRole);

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
  const closed = pendingApprovals.length > 0
    ? pendingApprovals
    : await (async () => {
        const anyPending = await CrmApprovalRequest.findOne({ linked_record_id: quote._id, status: "Pending" });
        if (anyPending) {
          anyPending.status = "Approved";
          if (notes) anyPending.decision_notes = notes;
          anyPending.decided_at = new Date();
          await anyPending.save();
          return [anyPending];
        }
        return [];
      })();

  // ── Multi-step chain advancement (6.3) ──────────────────────────────────────
  // If the request just approved was part of a policy chain and there's a next
  // step, route to it and KEEP the quote pending instead of finalizing.
  const chainReq = closed.find((r) => typeof r.step_index === "number" && typeof r.total_steps === "number");
  if (chainReq && chainReq.policy_id && (chainReq.step_index as number) + 1 < (chainReq.total_steps as number)) {
    const policy = await CrmApprovalPolicy.findOne({ _id: chainReq.policy_id, tenantId: quote.tenantId });
    if (policy && policy.steps?.length) {
      const metrics: RecordMetrics = { avgDiscountPercent: computeAverageDiscount(quote), totalAmount: computeQuoteTotal(quote) };
      const chain = applicableSteps(metrics, policy.steps);
      const nextIndex = (chainReq.step_index as number) + 1;
      if (nextIndex < chain.length) {
        const { approver } = await createStepRequest(quote, String(chainReq.requested_by_id), policy._id, chain[nextIndex], nextIndex, chain.length, metrics);
        // Quote stays "Pending Approval" — do not finalize yet.
        await CrmAuditLog.create({
          tenantId: quote.tenantId, user_id: approverId, action: "approved", record_type: "Quote", record_id: quote._id,
          new_value: `Step ${nextIndex} approved; routed to ${chain[nextIndex].approverRole} (${approver.name}) for step ${nextIndex + 1} of ${chain.length}.`, timestamp: new Date(),
        });
        return quote;
      }
    }
  }

  // Final approval (legacy single-tier, or the last step of a chain).
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
