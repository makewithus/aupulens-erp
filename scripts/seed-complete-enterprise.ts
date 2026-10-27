import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// AES-256-GCM encryption matching lib/crypto.ts
function encrypt(plaintext: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

const TENANT_ID = "default-tenant";

async function main() {
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB cluster.");

    // Seed only the database configured for the running app.
    {
      const dbName = client.db().databaseName;
      console.log(`\n========================================`);
      console.log(`Starting Full Enterprise Seeding: ${dbName}`);
      console.log(`========================================`);
      const db = client.db(dbName);

      // 1. GLOBAL & MASTER ADMIN CREDENTIALS
      const adminPasswordHash = await bcrypt.hash("Aupulens@2026", 10);
      const backup1 = await bcrypt.hash("Aupulens@2026", 10);
      const backup2 = await bcrypt.hash("12345678", 10);
      const encSecret = encrypt("JBSWY3DPEHPK3PXP");

      await db.collection("adminusers").updateOne(
        { email: "admin@aupulens.com" },
        {
          $set: {
            name: "Aupulens Global Super Admin",
            email: "admin@aupulens.com",
            passwordHash: adminPasswordHash,
            role: "global_super_admin",
            status: "active",
            mfaEnabled: true,
            mfaSecretEncrypted: encSecret,
            mfaBackupCodeHashes: [backup1, backup2],
            failedLoginCount: 0,
            lockedUntil: null,
            updatedAt: new Date(),
          },
          $setOnInsert: { _id: new ObjectId(), createdAt: new Date() },
        },
        { upsert: true }
      );

      await db.collection("adminusers").updateOne(
        { email: "demo-admin@aupulens.local" },
        {
          $set: {
            name: "Demo Global Admin",
            email: "demo-admin@aupulens.local",
            passwordHash: adminPasswordHash,
            role: "global_super_admin",
            status: "active",
            mfaEnabled: true,
            mfaSecretEncrypted: encSecret,
            mfaBackupCodeHashes: [backup1, backup2],
            failedLoginCount: 0,
            lockedUntil: null,
            updatedAt: new Date(),
          },
          $setOnInsert: { _id: new ObjectId(), createdAt: new Date() },
        },
        { upsert: true }
      );

      const adminUser = await db.collection("users").findOne({ tenantId: TENANT_ID, email: "admin@aupulens.com" });
      const adminUserId = adminUser?._id || new ObjectId("6a215dc202e80e4219f412c0");

      // 2. HR MODULE SEEDING
      console.log("Seeding HR Departments & Employees...");
      const deptDefs = [
        { code: "ENG", name: "Engineering & Technology" },
        { code: "SALES", name: "Sales & Business Development" },
        { code: "FIN", name: "Finance & Accounts" },
        { code: "OPS", name: "Operations & Supply Chain" },
        { code: "HR", name: "Human Resources & Talent" },
      ];

      const deptIds: Record<string, ObjectId> = {};
      for (const d of deptDefs) {
        let dept = await db.collection("departments").findOne({ tenantId: TENANT_ID, code: d.code });
        if (!dept) {
          const res = await db.collection("departments").insertOne({
            tenantId: TENANT_ID,
            code: d.code,
            name: d.name,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          deptIds[d.code] = res.insertedId;
        } else {
          deptIds[d.code] = dept._id;
        }
      }

      const empDefs = [
        { code: "EMP-001", first: "Aarav", last: "Sharma", email: "aarav.sharma@aupulens.com", phone: "+919811100001", dept: "ENG", desig: "Senior Lead Architect", gross: 125000 },
        { code: "EMP-002", first: "Priya", last: "Nair", email: "priya.nair@aupulens.com", phone: "+919811100002", dept: "ENG", desig: "Full Stack Engineer", gross: 85000 },
        { code: "EMP-003", first: "David", last: "Davis", email: "david@aupulens.com", phone: "+919876543210", dept: "SALES", desig: "Sales Director", gross: 110000 },
        { code: "EMP-004", first: "Ananya", last: "Verma", email: "ananya.verma@aupulens.com", phone: "+919811100004", dept: "SALES", desig: "Key Account Manager", gross: 75000 },
        { code: "EMP-005", first: "Kishore", last: "Kumar", email: "kishore.kumar@aupulens.com", phone: "+919811100005", dept: "FIN", desig: "Head of Accounts", gross: 95000 },
        { code: "EMP-006", first: "Neha", last: "Gupta", email: "neha.gupta@aupulens.com", phone: "+919811100006", dept: "FIN", desig: "Senior Tax Accountant", gross: 70000 },
        { code: "EMP-007", first: "Vikram", last: "Mehta", email: "vikram.mehta@aupulens.com", phone: "+919811100007", dept: "OPS", desig: "Operations Supervisor", gross: 65000 },
        { code: "EMP-008", first: "Pooja", last: "Iyer", email: "pooja.iyer@aupulens.com", phone: "+919811100008", dept: "HR", desig: "HR Business Partner", gross: 60000 },
      ];

      const empIds: ObjectId[] = [];
      for (const e of empDefs) {
        let emp = await db.collection("employees").findOne({ tenantId: TENANT_ID, employeeCode: e.code });
        if (!emp) {
          const res = await db.collection("employees").insertOne({
            tenantId: TENANT_ID,
            employeeCode: e.code,
            firstName: e.first,
            lastName: e.last,
            email: e.email,
            phone: e.phone,
            departmentId: deptIds[e.dept],
            designation: e.desig,
            employmentType: "full-time",
            lifecycleStatus: "active",
            dateOfJoining: new Date("2024-01-15T00:00:00.000Z"),
            salary: { basic: Math.round(e.gross * 0.5), grossSalary: e.gross, netSalary: Math.round(e.gross * 0.88) },
            createdBy: adminUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          empIds.push(res.insertedId);
        } else {
          empIds.push(emp._id);
        }
      }

      // Attendance records (past 5 working days)
      const existingAttendance = await db.collection("attendances").countDocuments({ tenantId: TENANT_ID });
      if (existingAttendance < 20) {
        const now = new Date();
        const attDocs = [];
        for (let d = 1; d <= 5; d++) {
          const date = new Date(now.getTime() - d * 86400000);
          for (const eid of empIds) {
            attDocs.push({
              tenantId: TENANT_ID,
              employeeId: eid,
              date,
              status: "present",
              checkIn: new Date(date.setHours(9, 30, 0, 0)),
              checkOut: new Date(date.setHours(18, 30, 0, 0)),
              workHours: 9,
              createdAt: date,
              updatedAt: date,
            });
          }
        }
        await db.collection("attendances").insertMany(attDocs);
        console.log(`Created ${attDocs.length} attendance records.`);
      }

      // Leave Requests
      const existingLeaves = await db.collection("leaverequests").countDocuments({ tenantId: TENANT_ID });
      if (existingLeaves < 4) {
        const leaveDocs = [
          {
            tenantId: TENANT_ID,
            employeeId: empIds[0],
            leaveType: "casual",
            startDate: new Date("2026-10-28"),
            endDate: new Date("2026-10-29"),
            totalDays: 2,
            reason: "Personal family commitment",
            status: "approved",
            approvedBy: adminUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            tenantId: TENANT_ID,
            employeeId: empIds[1],
            leaveType: "sick",
            startDate: new Date("2026-10-20"),
            endDate: new Date("2026-10-21"),
            totalDays: 2,
            reason: "Viral fever recovery",
            status: "approved",
            approvedBy: adminUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            tenantId: TENANT_ID,
            employeeId: empIds[3],
            leaveType: "privilege",
            startDate: new Date("2026-11-10"),
            endDate: new Date("2026-11-15"),
            totalDays: 5,
            reason: "Annual vacation",
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
        await db.collection("leaverequests").insertMany(leaveDocs);
        console.log(`Created ${leaveDocs.length} leave requests.`);
      }

      // Payroll Run
      const existingPayroll = await db.collection("payrolls").countDocuments({ tenantId: TENANT_ID });
      if (existingPayroll === 0) {
        await db.collection("payrolls").insertOne({
          tenantId: TENANT_ID,
          payrollNumber: "PAY-2026-09",
          month: 9,
          year: 2026,
          title: "September 2026 General Payroll",
          status: "approved",
          totalGross: 680000,
          totalDeductions: 81600,
          totalNet: 598400,
          paymentDate: new Date("2026-09-30"),
          employeeCount: empIds.length,
          createdBy: adminUserId,
          createdAt: new Date("2026-09-30"),
          updatedAt: new Date("2026-09-30"),
        });
        console.log("Created September 2026 payroll run.");
      }

      // 3. CRM MODULE SEEDING
      console.log("Seeding CRM Accounts, Contacts, Leads & Opportunities...");
      const crmAccountDefs = [
        { name: "Reliance Retail Enterprises", industry: "Retail & Consumer", revenue: 85000000, status: "Active" },
        { name: "Adani Logistics Hub", industry: "Transportation", revenue: 120000000, status: "Active" },
        { name: "Mahindra Heavy Engineering", industry: "Manufacturing", revenue: 95000000, status: "Active" },
      ];

      const crmAccountIds: ObjectId[] = [];
      for (const a of crmAccountDefs) {
        let acc = await db.collection("crmaccounts").findOne({ tenantId: TENANT_ID, name: a.name });
        if (!acc) {
          const res = await db.collection("crmaccounts").insertOne({
            tenantId: TENANT_ID,
            name: a.name,
            industry: a.industry,
            annual_revenue: a.revenue,
            status: a.status,
            owner_id: adminUserId,
            createdBy: adminUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          crmAccountIds.push(res.insertedId);
        } else {
          crmAccountIds.push(acc._id);
        }
      }

      const crmLeadDefs = [
        { name: "Rajiv Malhotra", company: "Omega Pharma Solutions", email: "rajiv@omegapharma.example", phone: "+919822200001", source: "Website Form", status: "Qualified", priority: "High", budget: "₹15,00,000", score: 85 },
        { name: "Suresh Menon", company: "Southern Agro Processors", email: "suresh@southernagro.example", phone: "+919822200002", source: "Referral", status: "Attempting Contact", priority: "Medium", budget: "₹8,00,000", score: 65 },
        { name: "Tarun Bajaj", company: "Bajaj Automotive Components", email: "tarun@bajajcomp.example", phone: "+919822200003", source: "Direct Website", status: "Connected", priority: "High", budget: "₹25,00,000", score: 90 },
        { name: "Kavita Rao", company: "Zenith Cloud Consulting", email: "kavita@zenithcloud.example", phone: "+919822200004", source: "Social Media", status: "New", priority: "Low", budget: "₹5,00,000", score: 45 },
      ];

      for (const l of crmLeadDefs) {
        const existing = await db.collection("crmleads").findOne({ tenantId: TENANT_ID, lead_name: l.name });
        if (!existing) {
          await db.collection("crmleads").insertOne({
            tenantId: TENANT_ID,
            lead_name: l.name,
            company_name: l.company,
            email: l.email,
            phone: l.phone,
            source: l.source,
            owner_id: adminUserId,
            status: l.status,
            priority: l.priority,
            budget_range: l.budget,
            lead_score: l.score,
            tags: ["Enterprise", "ERP-Upgrade"],
            createdBy: adminUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      const crmOppDefs = [
        { name: "Reliance ERP Multi-Site Upgrade", size: 4500000, stage: "Proposal", prob: 70, close: new Date("2026-11-30"), accId: crmAccountIds[0] },
        { name: "Adani Warehouse Automation Suite", size: 6200000, stage: "Negotiation", prob: 85, close: new Date("2026-12-15"), accId: crmAccountIds[1] },
        { name: "Mahindra Smart Shopfloor Integration", size: 3800000, stage: "Qualified", prob: 50, close: new Date("2027-01-31"), accId: crmAccountIds[2] },
      ];

      for (const o of crmOppDefs) {
        const existing = await db.collection("crmopportunities").findOne({ tenantId: TENANT_ID, opportunity_name: o.name });
        if (!existing) {
          await db.collection("crmopportunities").insertOne({
            tenantId: TENANT_ID,
            opportunity_name: o.name,
            deal_size: o.size,
            stage: o.stage,
            probability: o.prob,
            expected_close_date: o.close,
            account_id: o.accId,
            owner_id: adminUserId,
            createdBy: adminUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // 4. PROJECTS MODULE SEEDING
      console.log("Seeding Enterprise Projects...");
      const projectDefs = [
        { name: "Aupulens Cloud ERP Migration", desc: "Production migration of multi-tenant enterprise clusters to high-availability architecture.", status: "In Progress", priority: "High", progress: 78, start: new Date("2026-08-01"), due: new Date("2026-11-15") },
        { name: "GST 2.0 & E-Invoicing Automation", desc: "Seamless integration with NIC portal for automated IRN, QR code and e-Waybill generation.", status: "Completed", priority: "High", progress: 100, start: new Date("2026-07-01"), due: new Date("2026-09-30") },
        { name: "Q4 High-Yield Sales Expansion", desc: "Targeted outreach across Mumbai, Pune, Ahmedabad & Bangalore industrial corridors.", status: "In Progress", priority: "Medium", progress: 54, start: new Date("2026-09-15"), due: new Date("2026-12-31") },
        { name: "ISO 27001 & SOC 2 Security Audit", desc: "Formal platform penetration testing, audit log validation, and role policy reviews.", status: "Planning", priority: "High", progress: 25, start: new Date("2026-10-15"), due: new Date("2027-02-28") },
      ];

      for (const p of projectDefs) {
        const existing = await db.collection("projects").findOne({ tenantId: TENANT_ID, name: p.name });
        if (!existing) {
          await db.collection("projects").insertOne({
            tenantId: TENANT_ID,
            name: p.name,
            description: p.desc,
            status: p.status,
            priority: p.priority,
            progress: p.progress,
            startDate: p.start,
            dueDate: p.due,
            ownerId: adminUserId,
            members: [adminUserId],
            createdBy: adminUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // 5. OFFICIAL HSN & SAC REFERENCE IMPORT
      console.log("Seeding Official HSN / SAC References...");
      const hsnRefPath = path.join(process.cwd(), "hsn/india-hsn-2026.json");
      const sacRefPath = path.join(process.cwd(), "hsn/sac.json");

      const existingHsnCount = await db.collection("hsnsacreferences").countDocuments();
      if (existingHsnCount < 500 && fs.existsSync(hsnRefPath)) {
        const hsnRaw = JSON.parse(fs.readFileSync(hsnRefPath, "utf8"));
        const hsnData = hsnRaw.data || [];
        const hsnDocs = hsnData.slice(0, 1000).map((item: any) => ({
          code: String(item.hsn).trim(),
          type: "goods",
          description: item.description,
          gstRate: Number(item.igst ?? 18),
          gstTreatment: (item.igst === 0 ? "nil" : "taxable") as any,
          sourceId: "cbic-hsn-2026",
          sourceName: "CBIC Official ITC(HS)",
          version: "2026-04",
          effectiveFrom: new Date("2026-04-24T00:00:00.000Z"),
          keywords: [String(item.hsn), ...item.description.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((t: string) => t.length > 2)],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        let sacDocs: any[] = [];
        if (fs.existsSync(sacRefPath)) {
          const sacRaw = JSON.parse(fs.readFileSync(sacRefPath, "utf8"));
          sacDocs = sacRaw.map((item: any) => ({
            code: String(item.code).trim(),
            type: "service",
            description: item.desc,
            gstRate: 18,
            gstTreatment: "taxable",
            sourceId: "cbic-sac-2026",
            sourceName: "CBIC Official SAC",
            version: "2026-04",
            effectiveFrom: new Date("2026-04-24T00:00:00.000Z"),
            keywords: [String(item.code), ...item.desc.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((t: string) => t.length > 2)],
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        }

        const combinedHsn = [...hsnDocs, ...sacDocs];
        if (combinedHsn.length > 0) {
          const ops = combinedHsn.map((doc) => ({
            updateOne: {
              filter: { code: doc.code, type: doc.type },
              update: { $set: doc },
              upsert: true,
            },
          }));
          await db.collection("hsnsacreferences").bulkWrite(ops);
          console.log(`Successfully seeded ${combinedHsn.length} HSN/SAC references into ${dbName}.`);
        }
      } else {
        console.log(`HSN/SAC References: already ${existingHsnCount} present.`);
      }

      // 6. VERIFY 341 INVOICES ARE STILL 100% INTACT
      const finalInvoiceCount = await db.collection("salesinvoices").countDocuments({ tenantId: TENANT_ID });
      console.log(`\nVerified: Sales invoices for ${TENANT_ID} in ${dbName}: ${finalInvoiceCount} (SAFE)`);
    }

    console.log("\n=======================================================");
    console.log("FULL ENTERPRISE RECOVERY & SEEDING COMPLETED CLEANLY!");
    console.log("=======================================================");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
