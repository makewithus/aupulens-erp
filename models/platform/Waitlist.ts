import mongoose, { Schema, Document, Model } from "mongoose";
import {
  WAITLIST_STATUS,
  WAITLIST_STATUS_VALUES,
  WaitlistStatus,
} from "@/lib/constants/statuses";

export interface IWaitlist extends Document {
  waitlistId: string;
  fullName?: string;
  companyName: string;
  email: string;
  phone?: string;
  teamSize?: string;
  topic?: string;
  plan?: string;
  message?: string;
  formType: "book_demo" | "contact";
  status: WaitlistStatus;
  sourceUrl?: string;
  ipAddress?: string;
  userAgent?: string;
  emailDeliveryStatus: "pending" | "sent" | "failed" | "skipped";
  emailDeliveryError?: string;
  emailDeliveryAt?: Date;
  notes?: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaitlistSchema = new Schema<IWaitlist>(
  {
    waitlistId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    teamSize: {
      type: String,
      trim: true,
    },
    topic: {
      type: String,
      trim: true,
    },
    plan: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    formType: {
      type: String,
      required: true,
      enum: ["book_demo", "contact"],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: WAITLIST_STATUS_VALUES,
      default: WAITLIST_STATUS.NEW,
      index: true,
    },
    sourceUrl: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    emailDeliveryStatus: {
      type: String,
      required: true,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    emailDeliveryError: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    emailDeliveryAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient searching, filtering and deduplication
WaitlistSchema.index({ email: 1, submittedAt: -1 });
WaitlistSchema.index({ status: 1, submittedAt: -1 });
WaitlistSchema.index({ companyName: "text", fullName: "text", email: "text" });

const Waitlist: Model<IWaitlist> =
  (mongoose.models?.Waitlist as Model<IWaitlist>) ||
  mongoose.model<IWaitlist>("Waitlist", WaitlistSchema);

export default Waitlist;

