import mongoose from "mongoose";
import CrmActivity from "@/models/crm/Activity";

type AutoActivityProps = {
  tenantId: string;
  userId: string;
  subject: string;
  type?: 'Call'|'Email'|'Meeting'|'Note'|'Task'|'Visit'|'Quote Sent'|'Proposal Discussed'|'Document Shared'|'WhatsApp'|'Support Interaction';
  description?: string;
  linked_lead_id?: string;
  linked_account_id?: string;
  linked_contact_id?: string;
  linked_opportunity_id?: string;
  linked_case_id?: string;
};

export async function logSystemActivity(props: AutoActivityProps) {
  try {
    await CrmActivity.create({
      tenantId: props.tenantId,
      type: props.type || 'Note',
      subject: props.subject,
      description: props.description,
      performed_by_id: props.userId,
      createdBy: props.userId,
      activity_date: new Date(),
      linked_lead_id: props.linked_lead_id,
      linked_account_id: props.linked_account_id,
      linked_contact_id: props.linked_contact_id,
      linked_opportunity_id: props.linked_opportunity_id,
      linked_case_id: props.linked_case_id,
    });
  } catch (error) {
    console.error("Auto Activity Logger Error:", error);
  }
}
