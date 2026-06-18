import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAutomationRule extends Document {
  tenantId: string;
  name: string;
  description?: string;
  trigger: string; // record_created, field_changed, stage_changed, date_reached, approval_completed, quote_accepted, quote_rejected, no_activity, task_overdue, sla_breached, contract_expiring
  entity: string; // Lead, Opportunity, Account, Quote, Contract, Case
  conditions: {
    field: string;
    operator: string; // equals, not_equals, contains, greater_than, less_than, exists, date_before, date_after
    value: any;
  }[];
  actions: {
    type: string; // create_task, send_notification, update_field, change_status, assign_owner, create_related_record, add_tag, trigger_approval, send_email, send_whatsapp, send_sms, create_activity
    payload: any;
  }[];
  enabled: boolean;
  executionCount: number;
  lastExecutedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
}

const AutomationRuleSchema = new Schema<IAutomationRule>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    trigger: { type: String, required: true },
    entity: { type: String, required: true },
    conditions: [
      {
        field: { type: String, required: true },
        operator: { type: String, required: true },
        value: { type: Schema.Types.Mixed },
      },
    ],
    actions: [
      {
        type: { type: String, required: true },
        payload: { type: Schema.Types.Mixed },
      },
    ],
    enabled: { type: Boolean, default: true },
    executionCount: { type: Number, default: 0 },
    lastExecutedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

AutomationRuleSchema.index({ tenantId: 1, trigger: 1, entity: 1, enabled: 1 });

export default (mongoose.models.CrmAutomationRule as Model<IAutomationRule>) ||
  mongoose.model<IAutomationRule>("CrmAutomationRule", AutomationRuleSchema);
