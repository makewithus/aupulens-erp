import CrmActivity from "@/models/crm/Activity";

export async function sendCaseNotification(tenantId: string, event: string, crmCase: any, userId: string) {
  const eventMessages: Record<string, string> = {
    'Created': `Case ${crmCase.case_number} was created.`,
    'Assigned': `Case ${crmCase.case_number} assigned to you.`,
    'Escalated': `URGENT: Case ${crmCase.case_number} escalated to Level ${crmCase.escalation_level}.`,
    'Breached': `SLA BREACH: Case ${crmCase.case_number} has breached its target.`,
    'Reopened': `Case ${crmCase.case_number} was reopened by the customer.`,
    'Resolved': `Case ${crmCase.case_number} has been resolved.`,
    'Closed': `Case ${crmCase.case_number} has been closed.`
  };

  const message = eventMessages[event] || `Case ${crmCase.case_number} updated.`;

  // In a real system, this might send an email or push notification. 
  // For the CRM, we drop an Activity note that acts as a system notification feed.
  await CrmActivity.create({
    tenantId,
    type: 'Support Interaction',
    subject: `System Notification: ${event}`,
    description: message,
    linked_case_id: crmCase._id,
    performed_by_id: userId,
    createdBy: userId
  });
}
