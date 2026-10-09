import mongoose from "mongoose";
import Customer from "./models/sales/Customer";
import connectDB from "./lib/db";

async function run() {
  await connectDB();
  const c = await Customer.findOne({ "contact_details.mobile": { $exists: true } }).lean();
  console.log("Customer mobile:", c?.contact_details?.mobile);
  console.log("Customer phone:", c?.contact_details?.phone);
  process.exit(0);
}
run();
