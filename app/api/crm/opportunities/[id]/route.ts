import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import CrmActivity from "@/models/crm/Activity";
import CrmTask from "@/models/crm/Task";
import CrmContract from "@/models/crm/Contract";
import { requireRole } from "@/lib/crm/rbac";
import { validateOpportunityStage } from "@/lib/crm/opportunityStageEngine";
import { evaluateOpportunityHealth } from "@/lib/crm/opportunityHealth";
import { getLlmCrmInsight } from "@/lib/crm/ai/llmInsight";
import { recordAiInsight } from "@/lib/crm/ai/recordInsight";
import { calculateWinProbability, estimateWinProbabilityWithAi } from "@/lib/crm/winProbability";
import CrmCase from "@/models/crm/Case";
import { canAccessDemoDoc } from "@/lib/auth/scopeFilter";
import "@/models/crm/Contact";
import "@/models/crm/Account";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";
import { invalidateServerCache } from "@/lib/api/serverCache";
import { probabilityForOpportunityStage } from "@/lib/crm/opportunityStageProbability";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    requireRole(session, ['opportunity.read']);
  
  await dbConnect();
    const opp = await CrmOpportunity.findOne({ _id: params.id, tenantId: session.user.tenantId })
          .populate('account_id', 'company_name')
          .populate('owner_id', 'name')
          .lean();
    
  if (!opp || !canAccessDemoDoc(session, opp)) return NextResponse.json({ success: false, message: "Opportunity not found" }, { status: 404 });

  const includeInsights = req.nextUrl.searchParams.get("insights") === "true";
  // Keep the first detail response to the opportunity and its two visible
  // header relationships. Activity history, stakeholder population, and
  // health evaluation are only needed for the deferred enrichment request.
  let dynamicRisk: string = (opp as any).is_at_risk || (opp as any).risk_level === "High"
    ? "At Risk"
    : (opp as any).risk_level === "Medium" ? "Warning" : "Healthy";
  let healthFlags: string[] = [];
  let lastActivity: any = null;
  if (includeInsights) {
    const [activity, populatedOpportunity] = await Promise.all([
      CrmActivity.findOne({ linked_opportunity_id: params.id }).sort({ activity_date: -1 }).lean(),
      CrmOpportunity.populate(opp, { path: "stakeholders.contact_id", select: "first_name last_name email mobile" }),
    ]);
    lastActivity = activity;
    Object.assign(opp as any, populatedOpportunity);
    const health = evaluateOpportunityHealth(
      opp as any,
      lastActivity ? lastActivity.activity_date : null,
      0,
      50,
    );
    dynamicRisk = health.level;
    healthFlags = health.flags;
  }

  // Real AI deal-risk assessment (Phase 2): only called when the rule-based
  // health check already flagged concern, so a healthy deal never incurs AI
  // cost/latency on every view. The rule engine stays the source of truth
  // for *whether* something's wrong (deterministic, predictable); the LLM's
  // job is explaining *why* in plain language and suggesting a next action.
  let aiAssessment: { summary: string; reasoning: string; suggestedAction?: string; confidence: number } | null = null;
  if (includeInsights && dynamicRisk !== "Healthy") {
    const insight = await getLlmCrmInsight(
      session.user.tenantId,
      "Assess this specific sales opportunity using its current stage and the supplied facts. Explain only risks supported by ruleBasedFlags. Name the current stage accurately; never refer to a different stage. Make the next action appropriate for the current stage and deal name.",
      JSON.stringify({
        deal_name: (opp as any).deal_name,
        stage: (opp as any).stage,
        amount: (opp as any).amount,
        probability: (opp as any).probability,
        expected_close_date: (opp as any).expected_close_date,
        stage_entered_at: (opp as any).stage_entered_at,
        ruleBasedRiskLevel: dynamicRisk,
        ruleBasedFlags: healthFlags,
        lastActivityDate: lastActivity ? (lastActivity as any).activity_date : null,
        stakeholderCount: (opp as any).stakeholders?.length || 0,
      })
    );
    if (insight.ok) {
      const dealName = (opp as any).deal_name || (opp as any).name || "This opportunity";
      const stageActions: Record<string, string> = {
        Prospecting: "qualify the business need and identify the decision maker",
        Discovery: "confirm requirements, decision process, and success criteria",
        "Requirement Gathering": "validate scope, budget, and timeline with the customer",
        "Solution Fit": "review the proposed solution against confirmed requirements",
        "Proposal Sent": "confirm proposal receipt and schedule a review with the decision maker",
        Negotiation: "resolve remaining commercial or legal terms and agree on a decision date",
        Approval: "confirm the approval owner and follow up on final sign-off",
      };
      aiAssessment = {
        summary: `${dealName} · ${(opp as any).stage}: ${insight.summary}`,
        reasoning: `Current stage: ${(opp as any).stage}. Rule-based factors: ${healthFlags.join("; ")}. ${(opp as any).expected_close_date ? `Expected close: ${new Date((opp as any).expected_close_date).toLocaleDateString("en-GB")}. ` : ""}${insight.reasoning}`,
        suggestedAction: `For ${dealName}: ${stageActions[(opp as any).stage] || `review the flagged items in the ${(opp as any).stage} stage`}.`,
        confidence: insight.confidence,
      };
      if (dynamicRisk === "Critical" || dynamicRisk === "At Risk") {
        await recordAiInsight({
          tenantId: session.user.tenantId,
          entityType: "Opportunity",
          entityId: params.id,
          insightType: "Risk",
          insight,
        });
      }
    }
  }

  // Win probability (Native ERP AI functionality #7). Deterministic baseline
  // is free and always computed. The AI estimate is only spent on deals that
  // are already flagged (not Healthy) — mirroring the deal-risk cost discipline
  // above, so a healthy deal never incurs extra AI cost on every view. When AI
  // is gated/unavailable the estimate degrades to the deterministic number.
  const deterministicWinProb = calculateWinProbability(opp as any);
  let winProbability = deterministicWinProb;
  let winProbabilityAiUsed = false;
  if (includeInsights && dynamicRisk !== "Healthy") {
    const wp = await estimateWinProbabilityWithAi(session.user.tenantId, opp as any);
    winProbability = wp.probability;
    winProbabilityAiUsed = wp.insight.ok;
  }

    return NextResponse.json({
      success: true,
      data: {
        ...(opp as any),
        probability: probabilityForOpportunityStage((opp as any).stage, (opp as any).probability),
        weighted_value: ((opp as any).amount || 0) * (probabilityForOpportunityStage((opp as any).stage, (opp as any).probability) / 100),
        dynamicRisk,
        healthFlags,
        aiAssessment,
        winProbability,
        winProbabilityAiUsed,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const roleCheck = requireRole(session, ['opportunity.update']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  const opp = await CrmOpportunity.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!opp || !canAccessDemoDoc(session, opp)) return NextResponse.json({ success: false, message: "Opportunity not found" }, { status: 404 });

  const body = stripProtectedFields(await req.json());
  const oldStage = opp.stage;
  let stageTransition: { from: string; to: string; at: Date } | null = null;

  // The list checkbox is a Closed Won toggle, not a stage selector. Resolve
  // reopening from persisted history here so every client gets the same,
  // tenant-authoritative prior stage.
  if (typeof body.closedWon === 'boolean') {
    if (body.closedWon) {
      body.stage = 'Closed Won';
    } else if (opp.stage === 'Closed Won') {
      const history = Array.isArray(opp.stage_history) ? opp.stage_history : [];
      // Older seeded opportunities did not have stage_history. Their
      // immutable transition audit still records the stage they had when
      // marked won, so use that to repair the restore target as well.
      const firstClosedWonTransition = await CrmAuditLog.findOne({
        tenantId: session.user.tenantId,
        record_type: 'Opportunity',
        record_id: opp._id,
        field_name: 'stage',
        new_value: 'Closed Won',
      }).sort({ timestamp: 1 }).lean();
      const auditedPriorStage = firstClosedWonTransition?.old_value;
      const priorOpenStage = (auditedPriorStage && auditedPriorStage !== 'Closed Won' && auditedPriorStage !== 'Closed Lost'
        ? auditedPriorStage
        : undefined) || [...history].reverse()
        .find((entry: any) => entry.stage !== 'Closed Won' && entry.stage !== 'Closed Lost')?.stage;
      if (!priorOpenStage) {
        return NextResponse.json({
          success: false,
          message: 'This opportunity has no saved open stage to restore. Update its stage from the opportunity details first.',
        }, { status: 409 });
      }
      body.stage = priorOpenStage;
    } else {
      // An unchecked opportunity has nothing to reopen; avoid turning a
      // repeated/stale uncheck into an unrelated stage change.
      delete body.stage;
    }
  }

  if (body.stage && body.stage !== oldStage) {
    const { valid, message } = await validateOpportunityStage(opp, body.stage);
    if (!valid) return NextResponse.json({ success: false, message: message }, { status: 422 });
    if (body.stage === 'Closed Won') {
      const closeCheck = requireRole(session, ['opportunity.close']);
      if (closeCheck) return closeCheck;
    }

    // Persist the stage alongside its history; previously only the history
    // changed, so the board showed the optimistic move until the next fetch.
    opp.stage = body.stage;

    // Update history
    const history = (opp.stage_history || []).filter((entry: any, index: number, entries: any[]) =>
      index === 0 || entries[index - 1]?.stage !== entry.stage,
    );
    const transitionAt = new Date();
    stageTransition = { from: oldStage, to: body.stage, at: transitionAt };
    // Seed the transition's source stage when legacy/demo data has no history
    // (or history does not end at the persisted stage). Otherwise reopening a
    // newly closed seeded Negotiation deal would lose its actual prior stage.
    if (!history.length) {
      history.push({ stage: oldStage, entered_at: (opp as any).stage_entered_at || transitionAt });
    } else if (history[history.length - 1]?.stage !== oldStage) {
      history.push({ stage: oldStage, entered_at: (opp as any).stage_entered_at || transitionAt });
    }
    if (history[history.length - 1]?.stage !== body.stage) {
      if (history.length > 0) history[history.length - 1].exited_at = transitionAt;
      history.push({ stage: body.stage, entered_at: transitionAt });
    }
    opp.stage_history = history;
    opp.stage_entered_at = transitionAt;

    // Stage-specific automations
    if (body.stage === 'Proposal Sent') {
      await CrmTask.create({ tenantId: session.user.tenantId, title: "Follow Up Proposal", category: 'Follow Up', due_date: new Date(Date.now() + 86400000 * 3), assigned_to_id: opp.owner_id, linked_opportunity_id: opp._id, status: 'Pending', createdBy: session.user.id });
    } else if (body.stage === 'Negotiation') {
      await CrmTask.create({ tenantId: session.user.tenantId, title: "Prepare Approval Document", category: 'Prepare Quote', due_date: new Date(Date.now() + 86400000 * 2), assigned_to_id: opp.owner_id, linked_opportunity_id: opp._id, status: 'Pending', createdBy: session.user.id });
    } else if (body.stage === 'Closed Won') {
      await CrmTask.create({ tenantId: session.user.tenantId, title: "Initiate Onboarding", category: 'Onboarding', due_date: new Date(Date.now() + 86400000 * 1), assigned_to_id: opp.owner_id, linked_opportunity_id: opp._id, status: 'Pending', createdBy: session.user.id });
    }

    // Resolve the outcome of a renewal that was tracked via this opportunity
    // — nothing else in the app ever closes this loop, which previously
    // left every Contract.renewal_status stuck at "In Discussion" forever
    // and made the renewal-success-rate metric permanently 0/0. See
    // app/api/crm/contracts/[id]/renew/route.ts, which is what links a
    // contract to its renewal_opportunity_id in the first place.
    if (body.stage === 'Closed Won' || body.stage === 'Closed Lost') {
      const linkedContract = await CrmContract.findOne({ tenantId: session.user.tenantId, renewal_opportunity_id: opp._id });
      if (linkedContract) {
        linkedContract.renewal_status = body.stage === 'Closed Won' ? 'Renewed' : 'Lost';
        if (body.stage === 'Closed Won') linkedContract.status = 'Renewed';
        await linkedContract.save();
      }
    }

  }

  // Stage is the source of truth: stale/manual values must not make the
  // probability disagree with the deal's current pipeline status.
  opp.probability = probabilityForOpportunityStage(opp.stage, opp.probability);

  // Update other fields safely
  ['amount', 'expected_close_date', 'deal_name', 'stakeholders', 'detailed_competitors', 'budget_confirmed', 'timeline_confirmed'].forEach(f => {
    if (body[f] !== undefined) {
      (opp as any)[f] = body[f];
    }
  });

  // Calculate forecast
  if (body.amount !== undefined || body.probability !== undefined || body.stage !== undefined) {
    const amt = opp.amount || 0;
    const prob = opp.probability || 0;
    opp.weighted_value = amt * (prob / 100);
  }

  await opp.save();
  invalidateServerCache(`crm-analytics-live:${session.user.tenantId}:`);

  // Log the transition only after its stage and history are durably saved, so
  // the activity timeline and audit trail can never claim an unsaved move.
  if (stageTransition) {
    await CrmActivity.create({
      tenantId: session.user.tenantId,
      type: 'Note',
      subject: `Stage changed: ${stageTransition.from} → ${stageTransition.to}`,
      description: `Opportunity stage changed from ${stageTransition.from} to ${stageTransition.to}.`,
      activity_date: stageTransition.at,
      linked_opportunity_id: opp._id,
      createdBy: session.user.id,
      performed_by_id: session.user.id,
    });
    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: 'status_changed',
      record_type: 'Opportunity',
      record_id: opp._id,
      field_name: 'stage',
      old_value: stageTransition.from,
      new_value: stageTransition.to,
      timestamp: stageTransition.at,
    });
  }

  await CrmAuditLog.create({
    tenantId: session.user.tenantId, user_id: session.user.id, action: 'updated', record_type: 'Opportunity', record_id: opp._id, timestamp: new Date()
  });

    return NextResponse.json({ success: true, data: opp });
  } catch (error) {
    return handleRouteError(error);
  }
}
