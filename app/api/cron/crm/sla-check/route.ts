import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CrmCase from "@/models/crm/Case";
import CrmActivity from "@/models/crm/Activity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { sendCaseNotification } from "@/lib/crm/caseNotifications";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  await dbConnect();
  
  const breachedCases = await CrmCase.find({
    sla_target_at: { $lt: new Date() },
    sla_breached: false,
    status: { $nin: ['Resolved', 'Closed'] }
  });

  const updates = [];
  for (const c of breachedCases) {
    c.sla_breached = true;
    const oldLevel = c.escalation_level || 0;
    c.escalation_level = Math.min(oldLevel + 1, 4);
    if (!c.escalation_history) c.escalation_history = [];
    c.escalation_history.push({
      level: c.escalation_level,
      previous_level: oldLevel,
      trigger: 'SLA Breach Cron',
      user_id: c.createdBy,
      timestamp: new Date()
    });
    
    await c.save();
    
    // Also send breach notification asynchronously
    sendCaseNotification(c.tenantId, 'Breached', c, c.createdBy.toString()).catch(console.error);
    
    // Create activity
    updates.push(CrmActivity.create({
      tenantId: c.tenantId,
      type: 'Note',
      subject: 'SLA Breached & Escalated',
      description: `Case escalated to level ${c.escalation_level} due to SLA breach.`,
      linked_case_id: c._id,
      createdBy: c.createdBy,
      performed_by_id: c.createdBy
    }));
    
    updates.push(CrmAuditLog.create({
      tenantId: c.tenantId,
      user_id: c.createdBy,
      action: 'updated',
      record_type: 'Case',
      record_id: c._id,
      field_name: 'sla_breached',
      new_value: 'true',
      timestamp: new Date()
    }));
  }
  
  await Promise.all(updates);
  return NextResponse.json({ success: true, count: breachedCases.length });
}
