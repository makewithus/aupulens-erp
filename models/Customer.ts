import mongoose, { Schema, Document, Model } from "mongoose";
import "@/models/Account";
import { CUSTOMER_TYPE_VALUES, CUSTOMER_TYPE, type CustomerType } from "@/lib/constants/statuses";

export interface ICustomerAddress {
  label?: string;
  type: "billing" | "shipping";
  attention?: string;
  street?: string;
  street2?: string;
  city?: string;
  state_name?: string;
  zip?: string;
  country?: string;
  phone?: string;
  fax?: string;
  isPrimary?: boolean;
}

export interface ICustomerContactPerson {
  salutation?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  workPhone?: string;
  mobile?: string;
  designation?: string;
}

export interface ICustomerDocument {
  name: string;
  url: string;
  size?: number;
}

export interface ICustomer extends Document {
  tenantId?: string;
  header: {
    name: string;
    is_company: boolean;
    parent_id?: mongoose.Types.ObjectId;
    // Additive — New Customer form (Sales module revamp)
    displayName?: string;
    customerType?: CustomerType;
    salutation?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
  };
  contact_details: {
    email?: string;
    phone?: string;
    mobile?: string;
    website?: string;
    image_1920?: string;
    language?: string; // Additive — Customer Language
  };
  address_tab: {
    type: "contact" | "invoice" | "delivery" | "other" | "private";
    street?: string;
    street2?: string;
    city?: string;
    zip?: string;
    state_id?: number;
    country_id?: number;
    state_name?: string; // Additive: free-text state name for GST place-of-supply comparison
  };
  // Additive — Sales invoice feature (GSTIN search + Bill To/Ship To)
  gstin?: string;
  tags?: string[];
  shipping_address?: {
    street?: string;
    street2?: string;
    city?: string;
    zip?: string;
    state_name?: string;
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
  // Additive — New Customer form "Other Details" tab (Sales module revamp)
  pan?: string;
  currency?: string;
  openingBalance?: number;
  portalEnabled?: boolean;
  documents?: ICustomerDocument[];
  // Additive — richer multi-address / multi-contact-person support, alongside
  // the legacy address_tab/shipping_address (kept in sync for invoice PDFs etc.)
  addresses?: ICustomerAddress[];
  contactPersons?: ICustomerContactPerson[];
  customFields?: Record<string, string>;
  reportingTags?: string[];
  remarks?: string;
  isActive?: boolean; // Additive — drives the "Active/Inactive Customers" system views
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
      displayName: { type: String, trim: true },
      customerType: { type: String, enum: CUSTOMER_TYPE_VALUES, default: CUSTOMER_TYPE.BUSINESS },
      salutation: { type: String, trim: true },
      firstName: { type: String, trim: true },
      lastName: { type: String, trim: true },
      companyName: { type: String, trim: true },
    },
    contact_details: {
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String },
      mobile: { type: String },
      website: { type: String },
      image_1920: { type: String }, // Base64 string
      language: { type: String, default: "English" },
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
      state_name: { type: String, trim: true },
    },
    gstin: { type: String, trim: true, uppercase: true },
    tags: [{ type: String, trim: true }],
    shipping_address: {
      street: { type: String },
      street2: { type: String },
      city: { type: String },
      zip: { type: String },
      state_name: { type: String, trim: true },
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
    pan: { type: String, trim: true, uppercase: true },
    currency: { type: String, default: "INR" },
    openingBalance: { type: Number, default: 0 },
    portalEnabled: { type: Boolean, default: false },
    documents: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        size: { type: Number },
      },
    ],
    addresses: [
      {
        label: { type: String, trim: true },
        type: { type: String, enum: ["billing", "shipping"], required: true },
        attention: { type: String, trim: true },
        street: { type: String },
        street2: { type: String },
        city: { type: String },
        state_name: { type: String, trim: true },
        zip: { type: String },
        country: { type: String, trim: true },
        phone: { type: String },
        fax: { type: String },
        isPrimary: { type: Boolean, default: false },
      },
    ],
    contactPersons: [
      {
        salutation: { type: String, trim: true },
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        workPhone: { type: String },
        mobile: { type: String },
        designation: { type: String, trim: true },
      },
    ],
    customFields: { type: Schema.Types.Mixed, default: {} },
    reportingTags: [{ type: String, trim: true }],
    remarks: { type: String, maxlength: 2000 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

CustomerSchema.index({ "header.name": 1 });
CustomerSchema.index({ tenantId: 1, "header.displayName": 1 });

// Keep the legacy header.name populated for any existing consumer (invoice PDFs,
// popups, etc.) that never learned about displayName.
CustomerSchema.pre("save", function (next) {
  if (!this.header.name && this.header.displayName) {
    this.header.name = this.header.displayName;
  }
  if (!this.header.displayName) {
    this.header.displayName = this.header.name;
  }
  next();
});

const Customer: Model<ICustomer> =
  (mongoose.models.Customer as Model<ICustomer>) ||
  mongoose.model<ICustomer>("Customer", CustomerSchema);

export default Customer;
