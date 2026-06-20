import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import CrmActivity from "@/models/crm/Activity";
import CrmTask from "@/models/crm/Task";
import { requireRole } from "@/lib/crm/rbac";
import { validateOpportunityStage } from "@/lib/crm/opportunityStageEngine";
import { evaluateOpportunityHealth } from "@/lib/crm/opportunityHealth";
import CrmCase from "@/models/crm/Case";
import "@/models/crm/Contact";
import "@/models/crm/Account";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  requireRole(session, ['opportunity.read']);
  
  await dbConnect();
    const opp = await CrmOpportunity.findOne({ _id: params.id, tenantId: session.user.tenantId })
          .populate('account_id', 'company_name')
          .populate('owner_id', 'name')
          .populate('stakeholders.contact_id', 'first_name last_name email mobile').lean();
    
  if (!opp) return NextResponse.json({ success: false }, { status: 404 });

  // Calculate dynamic risk
  const lastActivity = await CrmActivity.findOne({ linked_opportunity_id: params.id }).sort({ activity_date: -1 }).lean();
  
  const health = evaluateOpportunityHealth(
    opp as any,
    lastActivity ? lastActivity.activity_date : null,
    0, // Mock closeDateChangesCount
    50 // Mock engagementScore
  );
  
  const dynamicRisk = health.level;
  
  return NextResponse.json({ success: true, data: { ...(opp as any), dynamicRisk, healthFlags: health.flags } });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  requireRole(session, ['opportunity.update']);
  
  await dbConnect();
  const opp = await CrmOpportunity.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!opp) return NextResponse.json({ success: false }, { status: 404 });

  const body = await req.json();
  const oldStage = opp.stage;

  if (body.stage && body.stage !== oldStage) {
    const { valid, message } = await validateOpportunityStage(opp, body.stage);
    if (!valid) return NextResponse.json({ success: false, message: message }, { status: 422 });

    // Update history
    const history = opp.stage_history || [];
    if (history.length > 0) history[history.length - 1].exited_at = new Date();
    history.push({ stage: body.stage, entered_at: new Date() });
    opp.stage_history = history;
    opp.stage_entered_at = new Date();

    // Automations
    await CrmActivity.create({
      tenantId: session.user.tenantId,
      type: 'Note',
      subject: `Stage moved from ${oldStage} to ${body.stage}`,
      linked_opportunity_id: opp._id,
      createdBy: session.user.id,
      performed_by_id: session.user.id
    });

    if (body.stage === 'Proposal Sent') {
      await CrmTask.create({ tenantId: session.user.tenantId, title: "Follow Up Proposal", category: 'Follow Up', due_date: new Date(Date.now() + 86400000 * 3), assigned_to_id: opp.owner_id, linked_opportunity_id: opp._id, status: 'Pending', createdBy: session.user.id });
    } else if (body.stage === 'Negotiation') {
      await CrmTask.create({ tenantId: session.user.tenantId, title: "Prepare Approval Document", category: 'Prepare Quote', due_date: new Date(Date.now() + 86400000 * 2), assigned_to_id: opp.owner_id, linked_opportunity_id: opp._id, status: 'Pending', createdBy: session.user.id });
    } else if (body.stage === 'Closed Won') {
      await CrmTask.create({ tenantId: session.user.tenantId, title: "Initiate Onboarding", category: 'Onboarding', due_date: new Date(Date.now() + 86400000 * 1), assigned_to_id: opp.owner_id, linked_opportunity_id: opp._id, status: 'Pending', createdBy: session.user.id });
      requireRole(session, ['opportunity.close']);
    }

    await CrmAuditLog.create({
      tenantId: session.user.tenantId, user_id: session.user.id, action: 'status_changed', record_type: 'Opportunity', record_id: opp._id, field_name: 'stage', old_value: oldStage, new_value: body.stage, timestamp: new Date()
    });
  }

  // Probability Engine Logic
  const PROBABILITY_MAP: Record<string, number> = {
    'Prospecting': 10, 'Discovery': 20, 'Requirement Gathering': 35,
    'Solution Fit': 50, 'Proposal Sent': 65, 'Negotiation': 80,
    'Approval': 90, 'Closed Won': 100, 'Closed Lost': 0
  };

  if (body.stage && body.stage !== oldStage && body.probability === undefined) {
    opp.probability = PROBABILITY_MAP[body.stage] || opp.probability;
  }

  // Update other fields safely
  ['amount', 'expected_close_date', 'deal_name', 'probability', 'stakeholders', 'detailed_competitors', 'budget_confirmed', 'timeline_confirmed'].forEach(f => {
    if (body[f] !== undefined) {
      if (f === 'probability' && body.probability !== opp.probability) {
        // Track override if manager changes probability manually
         CrmAuditLog.create({
           tenantId: session.user.tenantId, user_id: session.user.id, action: 'updated', record_type: 'Opportunity', record_id: opp._id, field_name: 'probability', old_value: opp.probability, new_value: body.probability, timestamp: new Date()
         });
      }
      (opp as any)[f] = body[f];
    }
  });

  // Calculate forecast
  if (body.amount !== undefined || body.probability !== undefined) {
    const amt = opp.amount || 0;
    const prob = opp.probability || 0;
    opp.weighted_value = amt * (prob / 100);
  }

  await opp.save();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId, user_id: session.user.id, action: 'updated', record_type: 'Opportunity', record_id: opp._id, timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: opp });
}
