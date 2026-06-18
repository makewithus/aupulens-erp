import dbConnect from "@/lib/db";
import CrmOnboardingPlan from "@/models/crm/OnboardingPlan";
import CrmTask from "@/models/crm/Task";
import CrmNotification from "@/models/crm/Notification";

export async function createOnboardingPlan(tenantId: string, accountId: string, opportunityId: string, ownerId: string, createdBy: string) {
  await dbConnect();

  // Create Plan
  const plan = await CrmOnboardingPlan.create({
    tenantId,
    account_id: accountId,
    opportunity_id: opportunityId,
    owner_id: ownerId,
    status: "Pending",
    progress: 0,
    milestones: [
      { title: "Kickoff Meeting", status: "Pending", dueDate: new Date(Date.now() + 86400000 * 3) },
      { title: "Data Migration", status: "Pending", dueDate: new Date(Date.now() + 86400000 * 7) },
      { title: "Team Training", status: "Pending", dueDate: new Date(Date.now() + 86400000 * 14) },
      { title: "Go Live", status: "Pending", dueDate: new Date(Date.now() + 86400000 * 21) },
    ],
    createdBy
  });

  // Create Initial Task
  await CrmTask.create({
    tenantId,
    title: "Schedule Onboarding Kickoff",
    related_record_type: "Account",
    related_record_id: accountId,
    due_date: new Date(Date.now() + 86400000),
    owner_id: ownerId,
    priority: "High",
    createdBy
  });

  // Notify Operations
  await CrmNotification.create({
    tenantId,
    userId: ownerId,
    type: "OnboardingAlert",
    title: "New Customer Onboarding",
    message: "A new opportunity was Closed Won. Please schedule the Kickoff meeting.",
    relatedRecordType: "Account",
    relatedRecordId: accountId,
    deliveryMethod: "InApp",
    status: "Sent"
  });

  return plan;
}
