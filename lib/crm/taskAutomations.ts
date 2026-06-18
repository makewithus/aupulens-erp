import CrmTask from "@/models/crm/Task";

export async function executeTaskAutomation(tenantId: string, event: string, payload: any, userId: string) {
  try {
    if (event === 'LeadCreated') {
      await CrmTask.create({
        tenantId,
        title: "First Contact Attempt",
        category: "Call Back",
        assigned_to_id: payload.owner_id,
        due_date: new Date(Date.now() + 86400000), // Next day
        priority: "High",
        status: "Pending",
        linked_lead_id: payload._id,
        createdBy: userId
      });
    }

    if (event === 'CaseCreated') {
      await CrmTask.create({
        tenantId,
        title: "First Response Triage",
        category: "Resolve Issue",
        assigned_to_id: payload.owner_id,
        due_date: new Date(Date.now() + 3600000), // 1 hour
        priority: payload.severity === 'Critical' ? "Urgent" : "Medium",
        status: "Pending",
        linked_case_id: payload._id,
        createdBy: userId
      });
    }

    if (event === 'ContractExpiring') {
      await CrmTask.create({
        tenantId,
        title: `Renew Contract: ${payload.contract_number}`,
        category: "Renew Contract",
        assigned_to_id: payload.owner_id,
        due_date: new Date(Date.now() + 86400000 * 3), 
        priority: "High",
        status: "Pending",
        linked_account_id: payload.account_id,
        createdBy: userId
      });
    }

    if (event === 'QuoteApproved') {
      await CrmTask.create({
        tenantId,
        title: "Send Quote to Customer",
        category: "Send Proposal",
        assigned_to_id: payload.owner_id,
        due_date: new Date(Date.now() + 86400000), 
        priority: "High",
        status: "Pending",
        linked_opportunity_id: payload.opportunity_id,
        linked_account_id: payload.account_id,
        createdBy: userId
      });
    }
  } catch (err) {
    console.error("Task automation failed:", err);
  }
}
