/**
 * Browser-QA fixture for the Sarvam work (docs/sarvam/QA_GUIDE.md "self-run log").
 * Adds to the standard platform demo (scripts/seed-platform-demo.ts) everything the guided-invoice and
 * multilingual screens need: sales/hr users, customers with near-miss names, invoice history (for item
 * suggestions), Sarvam cost rates, Sarvam usage + language interactions, and a tenant with NO customers
 * and NO AI usage. SAFETY: refuses to run unless MONGODB_URI is a local database whose name contains
 * "browser_qa" — it must never touch a real database.
 *
 *   MONGODB_URI=mongodb://localhost:27017/aupulens_browser_qa npx tsx scripts/seed-platform-demo.ts
 *   MONGODB_URI=mongodb://localhost:27017/aupulens_browser_qa npx tsx scripts/qa-browser-seed.ts <out-dir>
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../lib/db";
import User from "../models/auth/User";
import Organization from "../models/admin/Organization";
import Customer from "../models/sales/Customer";
import { SalesInvoice } from "../models/sales/SalesInvoice";
import AdminUser from "../models/platform/AdminUser";
import AiLanguageInteraction from "../models/ai/AiLanguageInteraction";
import AiUsageRecord from "../models/platform/AiUsageRecord";
import { createOrganization } from "../lib/platform/organizations/create";
import { createAdminSession } from "../lib/platform/auth/adminSession";
import { recordAiUsage, recordSarvamUsage } from "../lib/platform/ai/instrumentation";
import { rollupAiUsageForDay } from "../lib/platform/ai/rollup";
import { seedSarvamCostRates } from "./seed-platform-sarvam-cost-rates";
import { ADMIN_ROLE } from "../lib/constants/statuses";

const PASSWORD = "DemoOwnerPassword123!";

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)[:/].*browser_qa/.test(uri)) {
    throw new Error(`Refusing to run: MONGODB_URI must be a local database containing "browser_qa" (got ${uri.replace(/\/\/.*@/, "//***@")})`);
  }
  const outDir = process.argv[2] || ".";
  await connectDB();

  const acme: any = await Organization.findOne({ subdomain: "demo-acme" });
  if (!acme) throw new Error("Run scripts/seed-platform-demo.ts first (demo-acme is missing).");

  // The demo org is created on the starter tier (no "admin" module), which makes the AI panel's Q&A route answer 403 MODULE_NOT_AVAILABLE. QA needs the full product.
  await Organization.updateOne({ subdomain: "demo-acme" }, { $set: { tier: "enterprise", subscriptionStatus: "active" }, $addToSet: { "settings.enabledModules": "admin" } });

  const mkUser = (tenantId: string, name: string, email: string, role: string) =>
    User.findOneAndUpdate(
      { tenantId, email },
      { $setOnInsert: { tenantId, name, email, role, phone: "9999999999", status: "active" }, $set: { password: bcrypt.hashSync(PASSWORD, 10) } },
      { upsert: true, new: true },
    );
  await mkUser("demo-acme", "Sales Sam", "sales@demo-acme.demo", "sales");
  await mkUser("demo-acme", "HR Hana", "hr@demo-acme.demo", "hr");

  // Customers: near-miss names on purpose (Acme Trading / Acme Industries), a name that is also a Hindi word.
  const owner: any = await User.findOne({ tenantId: "demo-acme", role: "admin" });
  const customers: Record<string, any> = {};
  for (const name of ["Acme Trading", "Acme Industries", "Kamal", "Kanchipuram Silks Pvt Ltd"]) {
    customers[name] = await Customer.findOneAndUpdate(
      { tenantId: "demo-acme", "header.name": name },
      { $setOnInsert: { tenantId: "demo-acme", header: { name, displayName: name, is_company: true }, createdBy: owner._id } },
      { upsert: true, new: true },
    );
  }

  // Invoice history → the assistant's "recent items" choices.
  if ((await (SalesInvoice as any).countDocuments({ tenantId: "demo-acme" })) === 0) {
    const history: [string, string, number, number][] = [
      ["Acme Trading", "Consulting services", 1, 45000], ["Acme Trading", "Consulting services", 1, 30000], ["Kamal", "Consulting services", 2, 5000],
      ["Acme Industries", "Website design", 1, 80000], ["Kamal", "Website design", 1, 60000], ["Kanchipuram Silks Pvt Ltd", "Repairs", 3, 1200],
    ];
    let n = 0;
    for (const [cust, item, qty, price] of history) {
      n++;
      const total = qty * price;
      await (SalesInvoice as any).create({
        tenantId: "demo-acme", number: `QA-INV-${String(n).padStart(4, "0")}`, customerId: customers[cust]._id,
        invoiceDate: new Date(Date.now() - n * 86400000), dueDate: new Date(Date.now() + 7 * 86400000),
        lineItems: [{ name: item, qty, unitPrice: price, lineTotal: total }],
        taxableAmount: total, totalAmount: total, status: "draft", createdBy: owner._id,
      });
    }
  }

  // A tenant with NO customers and NO AI usage (empty states).
  if (!(await Organization.findOne({ subdomain: "qa-empty" }))) {
    await createOrganization(
      { id: "qa-seed", email: "seed@qa.local", name: "QA Seed", role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN, sessionId: "qa" } as any,
      { name: "QA Empty Co", subdomain: "qa-empty", organizationType: "sme" as any, ownerName: "Empty Owner", ownerEmail: "owner@qa-empty.demo", ownerPhone: "9999999999", ownerPassword: PASSWORD, country: "India" },
    );
  }
  await mkUser("qa-empty", "Empty Sales", "sales@qa-empty.demo", "sales");

  // Sarvam: real seeded rate → real cost figures; usage + language interactions for demo-acme.
  await seedSarvamCostRates({ SARVAM_COST_PER_1K_CHARS_USD: "0.002" } as any);
  if ((await AiUsageRecord.countDocuments({ tenantId: "demo-acme", provider: "sarvam" })) === 0) {
    for (let i = 0; i < 6; i++) {
      await recordAiUsage({ tenantId: "demo-acme", feature: "chat", model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-4o", inputTokens: 900, outputTokens: 300, latencyMs: 1800, status: "success" });
      await recordSarvamUsage({ tenantId: "demo-acme", feature: "chat", call: { provider: "sarvam", type: "translate", model: "mayura:v1", characters: 1500 + i * 100, latencyMs: 420, ok: i !== 5 } });
    }
    await AiLanguageInteraction.create([
      { tenantId: "demo-acme", trace: {}, detectedLanguage: "hi-IN", degraded: false }, { tenantId: "demo-acme", trace: {}, detectedLanguage: "hi-IN", degraded: false },
      { tenantId: "demo-acme", trace: {}, detectedLanguage: "hi-IN", degraded: true }, { tenantId: "demo-acme", trace: {}, detectedLanguage: "ta-IN", degraded: false },
      { tenantId: "demo-acme", trace: {}, detectedLanguage: "ta-IN", degraded: false },
    ]);
  }
  await rollupAiUsageForDay(new Date());

  // Platform admin session cookie (the demo admin's MFA enrolment is a separate, already-tested flow).
  const admin: any = await AdminUser.findOne({ email: "demo-admin@aupulens.local" });
  const s = await createAdminSession({ id: String(admin._id), email: admin.email, name: admin.name, role: admin.role }, { userAgent: "qa-browser" });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "admin_cookie.txt"), s.token);
  // A read-only platform admin, to check the "no permission" path on the admin screens.
  const ro: any = await AdminUser.findOneAndUpdate(
    { email: "readonly@aupulens.local" },
    { $setOnInsert: { name: "Read Only Admin", email: "readonly@aupulens.local", passwordHash: bcrypt.hashSync("ReadOnlyPassword123!", 10), role: ADMIN_ROLE.READ_ONLY_ADMIN, status: "active", mfaEnabled: false } },
    { upsert: true, new: true },
  );
  const rs = await createAdminSession({ id: String(ro._id), email: ro.email, name: ro.name, role: ro.role }, { userAgent: "qa-browser" });
  fs.writeFileSync(path.join(outDir, "readonly_cookie.txt"), rs.token);
  console.log(`QA fixture ready. Tenant logins (password ${PASSWORD}): owner@demo-acme.demo (admin), sales@demo-acme.demo, hr@demo-acme.demo, sales@qa-empty.demo`);
  await mongoose.connection.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
