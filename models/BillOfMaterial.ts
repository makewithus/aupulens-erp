import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBillOfMaterial extends Document {
  header: {
    productId: mongoose.Types.ObjectId;
    bomType: "mrp" | "kit";
    quantity: number;
    reference?: string;
  };
  components_tab: {
    productId: mongoose.Types.ObjectId;
    quantity: number;
  }[];
  miscellaneous: {
    flexibleConsumption?: "allowed" | "warning" | "blocked";
    projectId?: mongoose.Types.ObjectId;
    manufLeadTime?: number;
    prepTime?: number;
    batchSize?: number;
  };
  chatter: {
    authorId: mongoose.Types.ObjectId; // User or null
    body: string;
    type: "comment" | "notification";
    createdAt: Date;
  }[];
  tenantId?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const BillOfMaterialSchema = new Schema<IBillOfMaterial>(
  {
    header: {
      productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      bomType: {
        type: String,
        enum: ["mrp", "kit"],
        default: "mrp",
      },
      quantity: { type: Number, default: 1.0 },
      reference: { type: String },
    },
    components_tab: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, required: true, default: 1 },
      },
    ],
    miscellaneous: {
      flexibleConsumption: {
        type: String,
        enum: ["allowed", "warning", "blocked"],
        default: "allowed",
      },
      projectId: { type: Schema.Types.ObjectId, ref: "Project" }, // Assuming a Project model exists or will exist
      manufLeadTime: { type: Number, default: 0 },
      prepTime: { type: Number, default: 0 },
      batchSize: { type: Number, default: 1 },
    },
    chatter: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "User" },
        body: String,
        type: { type: String, enum: ["comment", "notification"] },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    tenantId: { type: String, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Prevent overwrite
const BillOfMaterial: Model<IBillOfMaterial> =
  (mongoose.models.BillOfMaterial as Model<IBillOfMaterial>) ||
  mongoose.model<IBillOfMaterial>("BillOfMaterial", BillOfMaterialSchema);

export default BillOfMaterial;
