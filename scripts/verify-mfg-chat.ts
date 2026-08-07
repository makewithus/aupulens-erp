/**
 * Scope C live verification: manufacturing ChatHistory persists AND is
 * cross-tenant isolated (real DB). Creates a chat for tenant-A, confirms
 * tenant-B's scoped query cannot see it, then cleans up.
 *
 * Run: npx tsx scripts/verify-mfg-chat.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { randomUUID } from "crypto";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const ChatHistory = (await import("../models/ChatHistory")).default;
  const userId = new mongoose.Types.ObjectId();

  const chat = await ChatHistory.create({
    userId, tenantId: "verify-tenant-A", module: "manufacturing", conversationId: randomUUID(),
    title: "SHP-VERIFY", messages: [{ role: "user", content: "create a shipment", timestamp: new Date() }], isArchived: false,
  });
  console.log(`Created manufacturing chat ${chat._id} for verify-tenant-A`);

  const aSees = await ChatHistory.find({ userId, tenantId: "verify-tenant-A", module: "manufacturing" }).lean();
  const bSees = await ChatHistory.find({ userId, tenantId: "verify-tenant-B", module: "manufacturing" }).lean();
  console.log(`tenant-A scoped query sees: ${aSees.length} chat(s)`);
  console.log(`tenant-B scoped query sees: ${bSees.length} chat(s) (must be 0)`);
  console.log(aSees.length === 1 && bSees.length === 0 ? "PASS: persisted for A, invisible to B" : "FAIL");

  await ChatHistory.deleteOne({ _id: chat._id });
  console.log("Cleanup done.");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
