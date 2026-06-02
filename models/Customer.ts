import mongoose, { Schema, Document, Model } from "mongoose";
import "@/models/Account";

export interface ICustomer extends Document {
  tenantId?: string;
  header: {
    name: string;
    is_company: boolean;
    parent_id?: mongoose.Types.ObjectId;
  };
  contact_details: {
    email?: string;
    phone?: string;
    mobile?: string;
    website?: string;
    image_1920?: string;
  };
  address_tab: {
    type: "contact" | "invoice" | "delivery" | "other" | "private";
    street?: string;
    street2?: string;
    city?: string;
    zip?: string;
    state_id?: number;
    country_id?: number;
  };
  sales_purchase_tab: {
    user_id?: mongoose.Types.ObjectId;
    property_payment_term_id?: string;
    property_product_pricelist?: mongoose.Types.ObjectId;
  };
  accounting_tab: {
    property_account_receivable_id?: mongoose.Types.ObjectId;
    property_account_payable_id?: mongoose.Types.ObjectId;
  };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema: Schema<ICustomer> = new Schema(
  {
    tenantId: { type: String, index: true },
    header: {
      name: { type: String, required: true, trim: true },
      is_company: { type: Boolean, default: false },
      parent_id: { type: Schema.Types.ObjectId, ref: "Customer" },
    },
    contact_details: {
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String },
      mobile: { type: String },
      website: { type: String },
      image_1920: { type: String }, // Base64 string
    },
    address_tab: {
      type: {
        type: String,
        enum: ["contact", "invoice", "delivery", "other", "private"],
        default: "contact",
      },
      street: { type: String },
      street2: { type: String },
      city: { type: String },
      zip: { type: String },
      state_id: { type: Number },
      country_id: { type: Number },
    },
    sales_purchase_tab: {
      user_id: { type: Schema.Types.ObjectId, ref: "User" },
      property_payment_term_id: { type: String },
      property_product_pricelist: {
        type: Schema.Types.ObjectId,
        ref: "Pricelist",
      },
    },
    accounting_tab: {
      property_account_receivable_id: {
        type: Schema.Types.ObjectId,
        ref: "Account",
      },
      property_account_payable_id: {
        type: Schema.Types.ObjectId,
        ref: "Account",
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

CustomerSchema.index({ "header.name": 1 });

const Customer: Model<ICustomer> =
  (mongoose.models.Customer as Model<ICustomer>) ||
  mongoose.model<ICustomer>("Customer", CustomerSchema);

export default Customer;
