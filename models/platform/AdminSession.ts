import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Server-side record of every admin session, independent of the signed JWT
 * cookie itself. The JWT (lib/platform/auth/adminSession.ts) is
 * stateless-verifiable, but a session must also be listable and individually
 * revocable (source doc §25: session timeout, IP/device capture on every
 * session) — this collection is what makes that possible and is what a
 * "hostile case" test (a revoked-but-not-yet-expired JWT) checks against.
 */
export interface IAdminSession extends Document {
  adminUserId: mongoose.Types.ObjectId;
  jti: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
}

const AdminSessionSchema = new Schema<IAdminSession>(
  {
    adminUserId: {
      type: Schema.Types.ObjectId,
      ref: "AdminUser",
      required: true,
    },
    jti: { type: String, required: true, unique: true },
    ip: { type: String },
    userAgent: { type: String },
    lastActivityAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokedReason: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AdminSessionSchema.index({ adminUserId: 1, createdAt: -1 });
AdminSessionSchema.index({ expiresAt: 1 });

export default (mongoose.models.AdminSession as Model<IAdminSession>) ||
  mongoose.model<IAdminSession>("AdminSession", AdminSessionSchema);
