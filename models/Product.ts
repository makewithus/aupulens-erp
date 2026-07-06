import mongoose, { Schema, Document, Model } from "mongoose";
import "@/models/Account";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export interface IProduct extends Document {
  tenantId?: string;
  header: {
    name: string;
    sale_ok: boolean;
    purchase_ok: boolean;
    can_be_expensed: boolean;
  };
  // Opt-in override: when false (default), new stock movements that would
  // take this product's on-hand quantity below zero are rejected.
  allowNegativeStock: boolean;
  tab_general_information: {
    type: "consu" | "service" | "combo";
    service_tracking?:
      | "no"
      | "task_global_project"
      | "project_only"
      | "task_in_new_project";
    invoice_policy: "order" | "delivery";
    service_upsell: boolean;
    list_price: number;
    taxes_id: number[];
    standard_price: number;
    categ_id?: number;
    default_code?: string;
    description?: string;
  };
  tab_sales: {
    upsell_cross_sell: {
      optional_product_ids: number[];
    };
    extra_info: {
      tag_ids: number[];
      description_sale?: string;
    };
  };
  tab_prices: {
    pricelist_item_ids: {
      fixed_price: number;
      date_start: string;
      currency_id: number;
    }[];
  };
  tab_accounting: {
    cost_and_revenue: {
      property_account_income_id?: string;
      property_account_expense_id?: string;
    };
  };
  status: DocumentStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema: Schema<IProduct> = new Schema(
  {
    tenantId: { type: String, index: true },
    allowNegativeStock: { type: Boolean, default: false },
    header: {
      name: { type: String, required: true, trim: true },
      sale_ok: { type: Boolean, default: true },
      purchase_ok: { type: Boolean, default: true },
      can_be_expensed: { type: Boolean, default: false },
    },
    tab_general_information: {
      type: {
        type: String,
        enum: ["consu", "service", "combo"],
        required: true,
      },
      service_tracking: {
        type: String,
        enum: [
          "no",
          "task_global_project",
          "project_only",
          "task_in_new_project",
        ],
        default: "no",
      },
      invoice_policy: {
        type: String,
        enum: ["order", "delivery"],
        default: "order",
      },
      service_upsell: { type: Boolean, default: false },
      list_price: { type: Number, default: 1.0 },
      taxes_id: [{ type: Number }],
      standard_price: { type: Number, default: 0 },
      categ_id: { type: Number },
      default_code: { type: String, trim: true },
      description: { type: String },
    },
    tab_sales: {
      upsell_cross_sell: {
        optional_product_ids: [{ type: Number }],
      },
      extra_info: {
        tag_ids: [{ type: Number }],
        description_sale: { type: String },
      },
    },
    tab_prices: {
      pricelist_item_ids: [
        {
          pricelist_id: { type: Schema.Types.ObjectId, ref: "Pricelist" },
          fixed_price: { type: Number },
          date_start: { type: String },
          currency_id: { type: Number },
        },
      ],
    },
    tab_accounting: {
      cost_and_revenue: {
        property_account_income_id: {
          type: Schema.Types.ObjectId,
          ref: "Account",
        },
        property_account_expense_id: {
          type: Schema.Types.ObjectId,
          ref: "Account",
        },
      },
    },
    status: { type: String, enum: DOCUMENT_STATUS_VALUES, default: DOCUMENT_STATUS.DRAFT },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

ProductSchema.index({ "header.name": 1 });

const Product: Model<IProduct> =
  (mongoose.models.Product as Model<IProduct>) ||
  mongoose.model<IProduct>("Product", ProductSchema);

export default Product;
