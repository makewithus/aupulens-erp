import mongoose, { Schema } from "mongoose";

const OrgInviteSchema = new Schema({});

const OrgInvite =
  (mongoose.models?.OrgInvite as mongoose.Model<any>) ||
  mongoose.model<any>("OrgInvite", OrgInviteSchema);

export default OrgInvite;
