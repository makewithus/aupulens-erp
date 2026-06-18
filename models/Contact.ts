import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContact extends Document {
  tenantId: string;
  first_name: string;
  last_name: string;
  designation: string;
  email: string;
  mobile: string;
  department: string;
  role_in_buying: string;
  preferred_communication: string;
  account_id: mongoose.Types.ObjectId;
  is_primary: boolean;
  is_decision_maker: boolean;
  opt_in_status: boolean;
  tags: string[];
  createdBy: mongoose.Types.ObjectId;
}

const ContactSchema = new Schema<IContact>({
  tenantId: { type: String, required: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  designation: { type: String },
  email: { type: String },
  mobile: { type: String },
  department: { type: String },
  role_in_buying: { type: String },
  preferred_communication: { type: String },
  account_id: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  is_primary: { type: Boolean },
  is_decision_maker: { type: Boolean },
  opt_in_status: { type: Boolean },
  tags: [{ type: String }],
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export default (mongoose.models.Contact as Model<IContact>) || mongoose.model<IContact>("Contact", ContactSchema);
