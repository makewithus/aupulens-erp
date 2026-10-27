/**
 * AUPULENS ERP — Comprehensive Admin-Only Demo Data Seeder
 *
 * Seeds realistic, internally-consistent, relationally linked demo datasets
 * across all 7 ERP modules (Sales, Inventory, Finance, Manufacturing, HR, Admin, CRM)
 * exclusively for the Admin portal and authorized Admin users in default-tenant.
 *
 * Idempotent: Every entity is keyed deterministically (code, number, name) and uses
 * upsert/check-before-insert semantics so running multiple times produces identical counts.
 *
 * Strict Admin-Only Scoping: All newly generated demo records are explicitly tagged
 * with `isDemo: true` and `source: "admin_demo_restoration_v1"`.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/seed-admin-demo.ts
 */

import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

const TENANT_ID = "default-tenant";
const DEMO_SOURCE = "admin_demo_restoration_v1";

// ── Deterministic Name Dictionaries for 350 Indian Employees ──
const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
  "Shaurya", "Atharva", "Advik", "Pranav", "Advaith", "Aaryan", "Dhruv", "Kabir", "Ritvik", "Darsh",
  "Kian", "Rudra", "Nihant", "Samarth", "Anay", "Shlok", "Tanmay", "Abeer", "Parth", "Devansh",
  "Ananya", "Diya", "Priya", "Sneha", "Aditi", "Pooja", "Neha", "Tanvi", "Kavya", "Ishita",
  "Riya", "Shreya", "Meera", "Aanya", "Anika", "Saanvi", "Tara", "Roshni", "Sunita", "Divya",
  "Swati", "Preeti", "Kavita", "Deepa", "Bhavna", "Radhika", "Shilpa", "Aparna", "Geeta", "Rekha",
  "Deepak", "Rajesh", "Suresh", "Ramesh", "Manish", "Sanjay", "Amit", "Rahul", "Alok", "Nikhil",
  "Rohit", "Sandeep", "Gaurav", "Varun", "Chetan", "Harish", "Manoj", "Sachin", "Nitin", "Sameer",
  "Vikram", "Vishal", "Ashish", "Kunal", "Abhinav", "Yash", "Kartik", "Siddharth", "Tushar", "Akshay",
  "Mayank", "Harsh", "Chirag", "Jatin", "Karan", "Mohit", "Pankaj", "Ravi", "Sumit", "Vikas"
];

const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Iyer", "Nair", "Mehta", "Patel", "Deshmukh", "Kulkarni", "Rao",
  "Joshi", "Bhat", "Reddy", "Singh", "Kumar", "Das", "Banerjee", "Chatterjee", "Mukherjee", "Ghosh",
  "Sengupta", "Bose", "Roy", "Dutta", "Pillai", "Menon", "Nambiar", "Gowda", "Hegde", "Shetty",
  "Nayak", "Pai", "Kamat", "Prabhu", "Agarwal", "Jain", "Shah", "Chauhan", "Yadav", "Mishra",
  "Pandey", "Tiwari", "Tripathi", "Shukla", "Dubey", "Srivastava", "Saxena", "Mathur", "Kapoor", "Khanna"
];

const CITIES = [
  { city: "Mumbai", state: "Maharashtra" },
  { city: "Pune", state: "Maharashtra" },
  { city: "Bangalore", state: "Karnataka" },
  { city: "Chennai", state: "Tamil Nadu" },
  { city: "Hyderabad", state: "Telangana" },
  { city: "Ahmedabad", state: "Gujarat" },
  { city: "New Delhi", state: "Delhi" },
  { city: "Gurgaon", state: "Haryana" },
  { city: "Kolkata", state: "West Bengal" },
  { city: "Jaipur", state: "Rajasthan" },
];

const DESIGNATIONS: Record<string, string[]> = {
  ENG: [
    "Senior Lead Architect", "Staff Platform Engineer", "Principal Software Engineer",
    "Senior Full Stack Engineer", "Full Stack Developer", "Backend Systems Engineer",
    "Frontend UI/UX Specialist", "QA Automation Engineer", "DevOps & Cloud Specialist",
    "Data Infrastructure Engineer", "Security & Compliance Lead", "Site Reliability Engineer",
    "Mobile Application Developer", "Junior Software Developer"
  ],
  SALES: [
    "Sales Director", "Enterprise Account Executive", "Regional Sales Manager",
    "Strategic Key Account Lead", "Senior Business Development Specialist",
    "Inside Sales Executive", "Pre-Sales Technical Consultant", "Customer Success Lead",
    "Commercial Sales Rep", "Sales Development Representative"
  ],
  OPS: [
    "Operations Director", "Senior Supply Chain Analyst", "Warehouse Operations Lead",
    "Logistics Fulfillment Coordinator", "Procurement & Sourcing Lead", "Inventory Control Specialist",
    "Quality Assurance Supervisor", "Plant Facilities Engineer", "Freight Dispatch Officer"
  ],
  FIN: [
    "Head of Accounts & Finance", "Senior Tax Compliance Accountant", "Financial Planning & Analysis Lead",
    "Senior Accounts Payable Lead", "Accounts Receivable Supervisor", "Statutory Audit Specialist",
    "Senior Payroll Controller", "Billing & Revenue Accountant"
  ],
  HR: [
    "Head of People & Culture", "Senior HR Business Partner", "Lead Talent Acquisition Specialist",
    "People Operations Coordinator", "Learning & Development Specialist", "Compensation & Benefits Analyst"
  ]
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("FATAL: MONGODB_URI environment variable is missing.");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    console.log(`Connected to database: ${db.databaseName}`);
    console.log(`Target Tenant Scope: ${TENANT_ID}`);
    console.log(`Seeder Run Tag: ${DEMO_SOURCE}\n`);

    // ── 0. Fetch or establish Admin Users ──
    const adminUser = await db.collection("users").findOne({ tenantId: TENANT_ID, role: "admin" });
    const adminUserId = adminUser?._id || new ObjectId("6a215dc202e80e4219f412c0");
    const demoPasswordHash = await bcrypt.hash("DemoUser@2026", 10);

    // ── 1. HR DEPARTMENTS ──
    console.log("==> Phase 1: Ensuring HR Departments...");
    const deptDefs = [
      { code: "ENG", name: "Engineering & Technology" },
      { code: "SALES", name: "Sales & Business Development" },
      { code: "OPS", name: "Operations & Supply Chain" },
      { code: "FIN", name: "Finance & Accounts" },
      { code: "HR", name: "Human Resources & Talent" },
    ];
    const deptIds: Record<string, ObjectId> = {};
    for (const d of deptDefs) {
      const existing = await db.collection("departments").findOne({ tenantId: TENANT_ID, code: d.code });
      if (existing) {
        deptIds[d.code] = existing._id;
      } else {
        const res = await db.collection("departments").insertOne({
          tenantId: TENANT_ID,
          code: d.code,
          name: d.name,
          isActive: true,
          isDemo: true,
          source: DEMO_SOURCE,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        deptIds[d.code] = res.insertedId;
      }
    }
    console.log("Departments verified:", Object.keys(deptIds).join(", "));

    // ── 2. SEED DEMO USER ACCOUNTS FOR BADGES ──
    console.log("\n==> Phase 2: Seeding Demo Portal Users for Role Badges...");
    const demoUserDefs = [
      { email: "aarav.sharma.demo@aupulens.com", name: "Aarav Sharma", role: "admin" },
      { email: "priya.nair.demo@aupulens.com", name: "Priya Nair", role: "hr" },
      { email: "david.davis.demo@aupulens.com", name: "David Davis", role: "sales" },
      { email: "ananya.verma.demo@aupulens.com", name: "Ananya Verma", role: "sales" },
      { email: "kishore.kumar.demo@aupulens.com", name: "Kishore Kumar", role: "finance" },
      { email: "neha.gupta.demo@aupulens.com", name: "Neha Gupta", role: "finance" },
      { email: "vikram.mehta.demo@aupulens.com", name: "Vikram Mehta", role: "inventory" },
      { email: "pooja.iyer.demo@aupulens.com", name: "Pooja Iyer", role: "hr" },
      { email: "rohan.kulkarni.demo@aupulens.com", name: "Rohan Kulkarni", role: "manufacturing" },
      { email: "aditi.deshmukh.demo@aupulens.com", name: "Aditi Deshmukh", role: "project" },
      { email: "sunita.rao.demo@aupulens.com", name: "Sunita Rao", role: "sales" },
      { email: "manish.jain.demo@aupulens.com", name: "Manish Jain", role: "inventory" },
      { email: "kunal.shah.demo@aupulens.com", name: "Kunal Shah", role: "manufacturing" },
      { email: "rajesh.iyer.demo@aupulens.com", name: "Rajesh Iyer", role: "admin" },
      { email: "deepak.sharma.demo@aupulens.com", name: "Deepak Sharma", role: "finance" },
    ];
    const demoUserMap: Record<string, ObjectId> = {};
    for (const u of demoUserDefs) {
      const existing = await db.collection("users").findOne({ tenantId: TENANT_ID, email: u.email });
      if (existing) {
        demoUserMap[u.email] = existing._id;
      } else {
        const res = await db.collection("users").insertOne({
          tenantId: TENANT_ID,
          name: u.name,
          email: u.email,
          role: u.role,
          password: demoPasswordHash,
          status: "active",
          isDemo: true,
          source: DEMO_SOURCE,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        demoUserMap[u.email] = res.insertedId;
      }
    }
    console.log(`Demo users linked accounts ready: ${Object.keys(demoUserMap).length}`);

    // ── 3. HR EMPLOYEES: EXACTLY 350 REALISTIC INDIAN EMPLOYEES ──
    console.log("\n==> Phase 3: Seeding 350 Indian Employees in HR Directory...");
    const TARGET_EMPLOYEE_COUNT = 350;
    const employeeBatch: any[] = [];
    const seededEmployeeIds: ObjectId[] = [];

    // Distribution:
    // 0..129 (130) -> ENG
    // 130..219 (90) -> SALES
    // 220..279 (60) -> OPS
    // 280..324 (45) -> FIN
    // 325..349 (25) -> HR
    for (let i = 0; i < TARGET_EMPLOYEE_COUNT; i++) {
      const code = `EMP-${String(i + 1).padStart(3, "0")}`;
      const first = FIRST_NAMES[i % FIRST_NAMES.length];
      const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
      const loc = CITIES[i % CITIES.length];

      let deptCode = "ENG";
      if (i >= 325) deptCode = "HR";
      else if (i >= 280) deptCode = "FIN";
      else if (i >= 220) deptCode = "OPS";
      else if (i >= 130) deptCode = "SALES";

      const deptDesigs = DESIGNATIONS[deptCode] || ["Specialist"];
      const desig = deptDesigs[i % deptDesigs.length];

      // Lifecycle status distribution:
      // active: 280 (0..279)
      // onboarding: 25 (280..304)
      // candidate: 15 (305..319)
      // on_notice: 12 (320..331)
      // exit_initiated: 6 (332..337)
      // clearance: 4 (338..341)
      // exited: 8 (342..349)
      let lifecycle = "active";
      if (i >= 342) lifecycle = "exited";
      else if (i >= 338) lifecycle = "clearance";
      else if (i >= 332) lifecycle = "exit_initiated";
      else if (i >= 320) lifecycle = "on_notice";
      else if (i >= 305) lifecycle = "candidate";
      else if (i >= 280) lifecycle = "onboarding";

      // Date of joining spread over 3 years
      const daysBack = (i * 3 + 12);
      const dateOfJoining = new Date(Date.now() - daysBack * 86400000);

      // Email & Phone
      const email = `${first.toLowerCase()}.${last.toLowerCase()}.${i + 1}@aupulens.demo`;
      const phone = `+9198${String(10000000 + i).slice(0, 8)}`;

      // Compensation
      const gross = 35000 + ((i * 1700) % 180000);
      const basic = Math.round(gross * 0.5);
      const hra = Math.round(gross * 0.2);
      const da = Math.round(gross * 0.1);
      const special = gross - basic - hra - da;
      const pf = Math.round(basic * 0.12);
      const pt = 200;
      const tds = Math.round(gross * 0.08);
      const net = gross - pf - pt - tds;

      // Link first 15 employees to demo user accounts
      let userId: ObjectId | null = null;
      if (i < demoUserDefs.length) {
        userId = demoUserMap[demoUserDefs[i].email] || null;
      }

      employeeBatch.push({
        tenantId: TENANT_ID,
        employeeCode: code,
        firstName: first,
        lastName: last,
        email,
        phone,
        departmentId: deptIds[deptCode],
        designation: desig,
        employmentType: i % 15 === 0 ? "contract" : (i % 25 === 0 ? "intern" : "full-time"),
        lifecycleStatus: lifecycle,
        dateOfJoining,
        dateOfBirth: new Date(1985 + (i % 15), (i % 12), (i % 28) + 1),
        gender: i % 2 === 0 ? "male" : "female",
        workLocation: `${loc.city} Tech Park`,
        address: {
          street: `${(i % 50) + 1}, Industrial Layout, Phase ${(i % 3) + 1}`,
          city: loc.city,
          state: loc.state,
          country: "India",
          zipCode: String(400001 + (i * 37) % 200000),
        },
        salary: {
          basic,
          hra,
          da,
          specialAllowance: special,
          grossSalary: gross,
          deductions: {
            pf,
            esi: gross <= 21000 ? Math.round(gross * 0.0075) : 0,
            professionalTax: pt,
            tds,
            otherDeductions: 0,
          },
          netSalary: net,
          currency: "INR",
        },
        leaveBalance: {
          casual: 12 - (i % 4),
          sick: 6 - (i % 2),
          earned: 15 - (i % 5),
          unpaid: 0,
        },
        status: lifecycle === "exited" ? "inactive" : "active",
        userId,
        isDemo: true,
        source: DEMO_SOURCE,
        createdBy: adminUserId,
        createdAt: dateOfJoining,
        updatedAt: new Date(),
      });
    }

    // Upsert all 350 employees idempotently
    const empOps = employeeBatch.map((emp) => ({
      updateOne: {
        filter: { tenantId: TENANT_ID, employeeCode: emp.employeeCode },
        update: { $set: emp },
        upsert: true,
      },
    }));
    const empWriteRes = await db.collection("employees").bulkWrite(empOps);
    console.log(`Employees upserted: ${empWriteRes.upsertedCount} inserted, ${empWriteRes.modifiedCount} updated.`);

    // Fetch employee _ids for relational linkage
    const allEmps = await db.collection("employees").find({ tenantId: TENANT_ID }).project({ _id: 1, employeeCode: 1, lifecycleStatus: 1 }).toArray();
    allEmps.forEach((e) => seededEmployeeIds.push(e._id));
    console.log(`Total verified employees in ${TENANT_ID}: ${allEmps.length}`);

    // ── 4. HR ATTENDANCE & LEAVES ──
    console.log("\n==> Phase 4: Seeding Attendance & Leave Requests...");
    // Reset any prior demo attendance/leave entries to ensure deterministic baseline
    await db.collection("attendances").deleteMany({ tenantId: TENANT_ID, source: DEMO_SOURCE });
    await db.collection("leaverequests").deleteMany({ tenantId: TENANT_ID, source: DEMO_SOURCE });

    const FIXED_SEED_DATE = new Date("2026-10-23T00:00:00.000Z");
    const activeEmps = allEmps.filter((e) => e.lifecycleStatus === "active").slice(0, 50);
    const attOps = [];
    for (let d = 0; d < 6; d++) {
      const attDate = new Date(FIXED_SEED_DATE.getTime() - d * 86400000);
      if (attDate.getUTCDay() === 0 || attDate.getUTCDay() === 6) continue; // skip weekends
      for (const e of activeEmps) {
        const checkIn = new Date(attDate);
        checkIn.setUTCHours(9, 30, 0, 0);
        const checkOut = new Date(attDate);
        checkOut.setUTCHours(18, 30, 0, 0);
        attOps.push({
          updateOne: {
            filter: { tenantId: TENANT_ID, employeeId: e._id, date: attDate },
            update: {
              $set: {
                tenantId: TENANT_ID,
                employeeId: e._id,
                date: attDate,
                status: "present",
                checkIn,
                checkOut,
                workHours: 9,
                isDemo: true,
                source: DEMO_SOURCE,
                updatedAt: new Date(),
              },
              $setOnInsert: { createdAt: attDate },
            },
            upsert: true,
          },
        });
      }
    }
    if (attOps.length > 0) {
      await db.collection("attendances").bulkWrite(attOps);
      console.log(`Attendance records synced: ${attOps.length}`);
    }

    // Leave Requests
    const leaveTypes = ["casual", "sick", "privilege", "maternity"];
    const leaveStatuses = ["approved", "pending", "rejected"];
    const leaveOps = [];
    for (let l = 0; l < 30; l++) {
      const emp = allEmps[l % allEmps.length];
      const start = new Date(FIXED_SEED_DATE.getTime() - (l * 3 - 5) * 86400000);
      const end = new Date(start.getTime() + (2 * 86400000));
      const reason = `Personal scheduled commitment reference #DEMO-LV-${l + 1}`;
      leaveOps.push({
        updateOne: {
          filter: { tenantId: TENANT_ID, reason },
          update: {
            $set: {
              tenantId: TENANT_ID,
              employeeId: emp._id,
              leaveType: leaveTypes[l % leaveTypes.length],
              startDate: start,
              endDate: end,
              totalDays: 2,
              reason,
              status: leaveStatuses[l % leaveStatuses.length],
              approvedBy: adminUserId,
              isDemo: true,
              source: DEMO_SOURCE,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: start },
          },
          upsert: true,
        },
      });
    }
    await db.collection("leaverequests").bulkWrite(leaveOps);
    console.log(`Leave requests synced: ${leaveOps.length}`);

    // Payroll Runs (Q1, Q2, Q3 2026)
    const payrollDefs = [
      { num: "PAY-2026-07", month: 7, year: 2026, title: "July 2026 Payroll Run", gross: 24500000, net: 20580000, count: 320 },
      { num: "PAY-2026-08", month: 8, year: 2026, title: "August 2026 Payroll Run", gross: 25100000, net: 21084000, count: 335 },
      { num: "PAY-2026-09", month: 9, year: 2026, title: "September 2026 Payroll Run", gross: 26250000, net: 22050000, count: 350 },
    ];
    // Fix any pre-existing record without payrollCode
    await db.collection("payrolls").updateMany(
      { tenantId: TENANT_ID, payrollCode: { $in: [null, undefined] } },
      { $set: { payrollCode: "PAY-2026-09" } }
    );

    for (const pr of payrollDefs) {
      await db.collection("payrolls").updateOne(
        { tenantId: TENANT_ID, payrollCode: pr.num },
        {
          $set: {
            tenantId: TENANT_ID,
            payrollCode: pr.num,
            payrollNumber: pr.num,
            month: pr.month,
            year: pr.year,
            title: pr.title,
            status: "approved",
            totalGross: pr.gross,
            totalDeductions: pr.gross - pr.net,
            totalNet: pr.net,
            employeeCount: pr.count,
            paymentDate: new Date(`${pr.year}-0${pr.month}-28`),
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(`${pr.year}-0${pr.month}-28`) },
        },
        { upsert: true }
      );
    }
    console.log("Historical payroll runs Q3 2026 verified.");

    // ── 5. INVENTORY WAREHOUSES & PRODUCTS ──
    console.log("\n==> Phase 5: Seeding Warehouses & Stock Reconciliation...");
    const warehouseDefs = [
      { code: "WH-MUM", name: "Mumbai Central Fulfillment Center", city: "Bhiwandi, MH", cap: 15000 },
      { code: "WH-PUN", name: "Pune Regional Industrial Hub", city: "Chakan Industrial Zone, Pune, MH", cap: 12000 },
      { code: "WH-BLR", name: "Bangalore South Tech Logistics Depot", city: "Peenya Industrial Area, Bengaluru, KA", cap: 10000 },
    ];
    const warehouseMap: Record<string, ObjectId> = {};
    for (const w of warehouseDefs) {
      const existing = await db.collection("warehouses").findOne({ tenantId: TENANT_ID, warehouseCode: w.code });
      if (existing) {
        warehouseMap[w.code] = existing._id;
      } else {
        const res = await db.collection("warehouses").insertOne({
          tenantId: TENANT_ID,
          warehouseCode: w.code,
          name: w.name,
          location: w.city,
          address: w.city,
          capacity: w.cap,
          currentUtilization: Math.round(w.cap * 0.45),
          type: "standard",
          manager: "Vikram Mehta",
          contact: "+919811100007",
          email: "warehouse.ops@aupulens.demo",
          status: "active",
          isDemo: true,
          source: DEMO_SOURCE,
          createdBy: adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        warehouseMap[w.code] = res.insertedId;
      }
    }
    console.log("Warehouses ready:", Object.keys(warehouseMap).join(", "));

    // Products check
    const products = await db.collection("products").find({ tenantId: TENANT_ID }).toArray();
    console.log(`Inventory products found: ${products.length}`);
    const prodMap: Record<string, any> = {};
    products.forEach((p) => {
      const code = p.tab_general_information?.default_code || p.default_code || p.name;
      prodMap[code] = p;
    });

    // ── 6. STOCK MOVEMENTS & BALANCES RECONCILIATION ──
    console.log("\n==> Phase 6: Seeding Stock Movements & Reconciling Stock Ledgers...");
    const stockMoveDefs = [
      { ref: "SM-2026-IN-001", type: "incoming", prod: "PRD-PKG", qty: 500, wh: "WH-MUM", date: new Date("2026-09-01"), cost: 300 },
      { ref: "SM-2026-IN-002", type: "incoming", prod: "PRD-BEARING", qty: 800, wh: "WH-MUM", date: new Date("2026-09-05"), cost: 1100 },
      { ref: "SM-2026-IN-003", type: "incoming", prod: "PRD-SOLAR5", qty: 50, wh: "WH-PUN", date: new Date("2026-09-10"), cost: 32000 },
      { ref: "SM-2026-IN-004", type: "incoming", prod: "PRD-CHAIR", qty: 120, wh: "WH-BLR", date: new Date("2026-09-12"), cost: 4200 },
      { ref: "SM-2026-IN-005", type: "incoming", prod: "PRD-RACK", qty: 60, wh: "WH-MUM", date: new Date("2026-09-15"), cost: 7200 },
      { ref: "SM-2026-TR-001", type: "internal", prod: "PRD-BEARING", qty: 200, wh: "WH-MUM", destWh: "WH-PUN", date: new Date("2026-09-18"), cost: 1100 },
      { ref: "SM-2026-TR-002", type: "internal", prod: "PRD-PKG", qty: 150, wh: "WH-MUM", destWh: "WH-BLR", date: new Date("2026-09-20"), cost: 300 },
      { ref: "SM-2026-OUT-001", type: "outgoing", prod: "PRD-SOLAR5", qty: 10, wh: "WH-PUN", date: new Date("2026-10-02"), cost: 32000 },
      { ref: "SM-2026-OUT-002", type: "outgoing", prod: "PRD-CHAIR", qty: 25, wh: "WH-BLR", date: new Date("2026-10-05"), cost: 4200 },
      { ref: "SM-2026-ADJ-001", type: "adjustment", prod: "PRD-BEARING", qty: 25, wh: "WH-PUN", date: new Date("2026-10-10"), cost: 1100 },
    ];

    const stockBalances: Record<string, number> = {}; // key: `${prodId}_${warehouseCode}`

    for (const sm of stockMoveDefs) {
      const p = prodMap[sm.prod] || products[0];
      const whId = warehouseMap[sm.wh] || Object.values(warehouseMap)[0];
      const destWhId = sm.destWh ? warehouseMap[sm.destWh] : whId;
      const totalVal = sm.qty * sm.cost;

      await db.collection("stockmoves").updateOne(
        { tenantId: TENANT_ID, reference: sm.ref },
        {
          $set: {
            tenantId: TENANT_ID,
            reference: sm.ref,
            moveType: sm.type,
            moveStatus: "completed",
            scheduledDate: sm.date,
            effectiveDate: sm.date,
            sourceLocation: { warehouseId: whId, warehouseName: sm.wh },
            destinationLocation: { warehouseId: destWhId, warehouseName: sm.destWh || sm.wh },
            lines: [
              {
                productId: p._id,
                productName: p.header?.name || p.name || sm.prod,
                demand: sm.qty,
                done: sm.qty,
                uom: "Units",
                unitCost: sm.cost,
                totalValue: totalVal,
              },
            ],
            valuation: { method: "standard", totalValue: totalVal, updatedAt: sm.date },
            isDemo: true,
            source: DEMO_SOURCE,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: sm.date },
        },
        { upsert: true }
      );

      // Track ledger balance calculations
      const keyPrimary = `${p._id}_${sm.wh}`;
      if (!stockBalances[keyPrimary]) stockBalances[keyPrimary] = 0;
      if (sm.type === "incoming") stockBalances[keyPrimary] += sm.qty;
      else if (sm.type === "outgoing") stockBalances[keyPrimary] -= sm.qty;
      else if (sm.type === "adjustment") stockBalances[keyPrimary] += sm.qty;
      else if (sm.type === "internal" && sm.destWh) {
        stockBalances[keyPrimary] -= sm.qty;
        const keyDest = `${p._id}_${sm.destWh}`;
        if (!stockBalances[keyDest]) stockBalances[keyDest] = 0;
        stockBalances[keyDest] += sm.qty;
      }
    }
    console.log(`Stock moves synced: ${stockMoveDefs.length}`);

    // Reconcile into collection `stocks`
    for (const [key, qty] of Object.entries(stockBalances)) {
      const [prodIdStr, whCode] = key.split("_");
      const prodId = new ObjectId(prodIdStr);
      await db.collection("stocks").updateOne(
        { tenantId: TENANT_ID, product: prodId, warehouse: whCode },
        {
          $set: {
            tenantId: TENANT_ID,
            product: prodId,
            warehouse: whCode,
            quantity: Math.max(0, qty),
            type: "in",
            reference: "RECONCILED-LEDGER-BALANCE",
            notes: `Auto-reconciled to Stock Movements for ${whCode}`,
            isReserved: false,
            isDemo: true,
            source: DEMO_SOURCE,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Stock quantities reconciled successfully.");

    // ── 7. SALES CUSTOMERS, QUOTES, ORDERS & SUBSCRIPTIONS ──
    console.log("\n==> Phase 7: Seeding Sales Quotes, Orders & Subscriptions...");
    const customerDefs = [
      { name: "Tata Steel Logistics Ltd", city: "Jamshedpur", state: "Jharkhand", gstin: "20AABCT1234F1Z1" },
      { name: "Reliance Jio Infocomm", city: "Navi Mumbai", state: "Maharashtra", gstin: "27AABCR9876K1Z9" },
      { name: "Infosys BPM Tech Services", city: "Bengaluru", state: "Karnataka", gstin: "29AABCI5432M1Z5" },
      { name: "Larsen & Toubro Heavy Inf", city: "Mumbai", state: "Maharashtra", gstin: "27AABCL1111P1Z2" },
      { name: "Bajaj Auto Distribution", city: "Pune", state: "Maharashtra", gstin: "27AABCB2222Q1Z3" },
      { name: "Mahindra Logistics Hub", city: "Pune", state: "Maharashtra", gstin: "27AABCM3333R1Z4" },
      { name: "Sundar Textiles Pvt Ltd", city: "Coimbatore", state: "Tamil Nadu", gstin: "33AABCS1234F1Z8" },
      { name: "Om Sai Traders", city: "Surat", state: "Gujarat", gstin: "24AABCO4444T1Z5" },
      { name: "Kaveri Subscriptions Pvt Ltd", city: "Mysuru", state: "Karnataka", gstin: "29AACCK4321L1ZR" },
      { name: "Greenfield Agro Exports", city: "Ludhiana", state: "Punjab", gstin: "03AAECG5678K1ZQ" },
    ];
    const customerIds: ObjectId[] = [];
    for (const c of customerDefs) {
      let cust = await db.collection("customers").findOne({ tenantId: TENANT_ID, "header.name": c.name });
      if (!cust) {
        const res = await db.collection("customers").insertOne({
          tenantId: TENANT_ID,
          header: { name: c.name, is_company: true, customerType: "business" },
          contact_details: { email: `billing@${c.name.toLowerCase().replace(/[^a-z]/g, "")}.demo`, phone: "+919822001122" },
          address_tab: { city: c.city, state_name: c.state },
          shipping_address: { street: "Gate 2 Industrial Estate", city: c.city, state_name: c.state },
          gstin: c.gstin,
          currency: "INR",
          openingBalance: 0,
          isDemo: true,
          source: DEMO_SOURCE,
          createdBy: adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        customerIds.push(res.insertedId);
      } else {
        customerIds.push(cust._id);
      }
    }
    console.log(`Customers active: ${customerIds.length}`);

    // Sales Quotations (15 quotes)
    const quoteStatuses = ["draft", "sent", "accepted", "rejected", "invoiced"];
    for (let q = 1; q <= 15; q++) {
      const qNum = `QT-2026-${String(q).padStart(4, "0")}`;
      const custId = customerIds[q % customerIds.length];
      const p = products[q % products.length] || products[0];
      const unitPrice = p.tab_general_information?.list_price || 15000;
      const qty = (q % 5) + 2;
      const taxable = unitPrice * qty;
      const tax = Math.round(taxable * 0.18);
      const total = taxable + tax;
      const status = quoteStatuses[q % quoteStatuses.length];

      await db.collection("salesquotations").updateOne(
        { tenantId: TENANT_ID, quoteNumber: qNum },
        {
          $set: {
            tenantId: TENANT_ID,
            quoteNumber: qNum,
            customerId: custId,
            quoteDate: new Date(Date.now() - (q * 3) * 86400000),
            validTill: new Date(Date.now() + (30 - q) * 86400000),
            salesperson: "David Davis",
            lineItems: [
              {
                itemId: p._id,
                name: p.header?.name || p.name || "Enterprise Solution",
                qty,
                unitPrice,
                discount: 0,
                taxRate: 18,
                lineTotal: taxable,
              },
            ],
            taxableAmount: taxable,
            totalDiscount: 0,
            totalAmount: total,
            status,
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (q * 3) * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Sales quotations verified: 15 quotes.");

    // Sales Orders (20 orders)
    const orderStatuses = ["draft", "confirmed", "closed", "void"];
    const shipmentStatuses = ["not_shipped", "partially_shipped", "fulfilled"];
    const invoicingStatuses = ["not_invoiced", "partially_invoiced", "invoiced"];

    for (let so = 1; so <= 20; so++) {
      const soNum = `SO-2026-${String(so).padStart(4, "0")}`;
      const custId = customerIds[so % customerIds.length];
      const p = products[so % products.length] || products[0];
      const priceUnit = p.tab_general_information?.list_price || 20000;
      const qty = (so % 4) + 1;
      const untaxed = priceUnit * qty;
      const tax = Math.round(untaxed * 0.18);
      const total = untaxed + tax;

      const orderStatus = orderStatuses[so % orderStatuses.length];
      const shipStatus = shipmentStatuses[so % shipmentStatuses.length];
      const invStatus = invoicingStatuses[so % invoicingStatuses.length];

      await db.collection("saleorders").updateOne(
        { tenantId: TENANT_ID, "header.name": soNum },
        {
          $set: {
            tenantId: TENANT_ID,
            header: {
              name: soNum,
              partnerId: custId,
              dateOrder: new Date(Date.now() - (so * 2) * 86400000),
            },
            orderLines: [
              {
                productId: p._id,
                name: p.header?.name || p.name || "Industrial Component Assembly",
                productQty: qty,
                priceUnit,
                priceSubtotal: untaxed,
                taxRate: 18,
              },
            ],
            totals: {
              amountUntaxed: untaxed,
              amountTax: tax,
              amountTotal: total,
            },
            status: orderStatus === "confirmed" ? "approved" : (orderStatus === "closed" ? "closed" : "draft"),
            salesOrderStatus: orderStatus,
            shipmentStatus: shipStatus,
            invoicingStatus: invStatus,
            otherInfo: { salespersonId: adminUserId },
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (so * 2) * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Sale orders verified: 20 orders.");

    // Subscriptions
    const subDefs = [
      { num: "SUB-DEMO-001", name: "Tata Steel - Monthly Enterprise ERP AMC", cust: 0, amt: 85000, status: "active" },
      { num: "SUB-DEMO-002", name: "Reliance Jio - Cloud Telemetry SLA", cust: 1, amt: 120000, status: "active" },
      { num: "SUB-DEMO-003", name: "Infosys BPM - Security Monitoring", cust: 2, amt: 65000, status: "active" },
      { num: "SUB-DEMO-004", name: "L&T Heavy - IoT Sensor Telemetry", cust: 3, amt: 95000, status: "trial" },
      { num: "SUB-DEMO-005", name: "Bajaj Auto - Multi-Site Dispatch License", cust: 4, amt: 45000, status: "active" },
      { num: "SUB-DEMO-006", name: "Kaveri Subscriptions - Quarterly AMC", cust: 8, amt: 36000, status: "past_due" },
    ];
    for (const sub of subDefs) {
      await db.collection("subscriptions").updateOne(
        { tenantId: TENANT_ID, number: sub.num },
        {
          $set: {
            tenantId: TENANT_ID,
            number: sub.num,
            profileName: sub.name,
            customerId: customerIds[sub.cust],
            status: sub.status,
            billingFrequency: "monthly",
            nextBillingOn: new Date(Date.now() + 15 * 86400000),
            activatedOn: new Date(Date.now() - 45 * 86400000),
            trialDays: sub.status === "trial" ? 14 : 0,
            autoRenew: true,
            lineItems: [{ name: sub.name, qty: 1, unitPrice: sub.amt, taxRate: 18, lineTotal: sub.amt }],
            totalAmount: sub.amt,
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - 45 * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Subscriptions verified: 6 contracts.");

    // ── 8. FINANCE & ACCOUNTING: VENDOR BILLS, FIXED ASSETS & BALANCED JOURNALS ──
    console.log("\n==> Phase 8: Seeding Finance Vendor Bills, Fixed Assets & Balanced Journals...");
    const billDefs = [
      { num: "BILL-2026-001", amt: 125000, state: "posted", partner: customerIds[0], desc: "Raw Material Ingot Supply" },
      { num: "BILL-2026-002", amt: 85000, state: "posted", partner: customerIds[1], desc: "Industrial Packaging Material" },
      { num: "BILL-2026-003", amt: 220000, state: "posted", partner: customerIds[2], desc: "AWS & Cloud Telemetry Infrastructure" },
      { num: "BILL-2026-004", amt: 65000, state: "posted", partner: customerIds[3], desc: "Plant Facility Maintenance & Security" },
      { num: "BILL-2026-005", amt: 140000, state: "approved", partner: customerIds[4], desc: "Logistics Fleet Maintenance" },
      { num: "BILL-2026-006", amt: 45000, state: "draft", partner: customerIds[5], desc: "Office Supplies & Workstation Racks" },
    ];
    for (const b of billDefs) {
      await db.collection("invoices").updateOne(
        { tenantId: TENANT_ID, name: b.num },
        {
          $set: {
            tenantId: TENANT_ID,
            name: b.num,
            partnerId: b.partner,
            moveType: "in_invoice",
            invoiceDate: new Date(Date.now() - 20 * 86400000),
            dueDate: new Date(Date.now() + 10 * 86400000),
            state: b.state,
            invoiceLines: [{ name: b.desc, quantity: 1, priceUnit: b.amt, priceSubtotal: b.amt }],
            currencyId: "INR",
            amountUntaxed: b.amt,
            amountTax: 0,
            amountTotal: b.amt,
            amountResidual: b.state === "posted" ? 0 : b.amt,
            paymentState: b.state === "posted" ? "paid" : "not_paid",
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - 20 * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Vendor bills verified: 6 records.");

    // Fixed Assets
    // Find accounts for assets:
    const accList = await db.collection("accounts").find({ tenantId: TENANT_ID }).toArray();
    const assetAcc = accList.find((a) => a.accountNumber === "1500" || a.code === "1500" || a.type === "fixed_asset")?._id || new ObjectId();
    const depExpAcc = accList.find((a) => a.accountNumber === "6600" || a.code === "6600" || a.type === "expense")?._id || new ObjectId();
    const bankAcc = accList.find((a) => a.accountNumber === "1050" || a.code === "1050" || a.type === "bank")?._id || new ObjectId();

    const assetDefs = [
      { name: "Heavy Duty Logistics Delivery Truck (MH-04-AB-1234)", val: 1850000, salvage: 250000, yrs: 7, method: "linear" },
      { name: "CNC High-Precision Milling Station #1", val: 3200000, salvage: 400000, yrs: 10, method: "degressive" },
      { name: "High-Availability Server Rack Hardware Cluster", val: 1450000, salvage: 150000, yrs: 5, method: "linear" },
      { name: "Executive Ergonomic Office Furniture Suite", val: 680000, salvage: 50000, yrs: 5, method: "linear" },
      { name: "Rooftop 50kW Industrial Solar Array Installation", val: 2400000, salvage: 300000, yrs: 15, method: "linear" },
      { name: "Advanced Materials Testing Laboratory Rig", val: 1150000, salvage: 120000, yrs: 8, method: "linear" },
    ];
    for (const a of assetDefs) {
      await db.collection("assets").updateOne(
        { tenantId: TENANT_ID, name: a.name },
        {
          $set: {
            tenantId: TENANT_ID,
            name: a.name,
            purchaseDate: new Date("2024-03-15T00:00:00.000Z"),
            originalValue: a.val,
            salvageValue: a.salvage,
            durationYears: a.yrs,
            method: a.method,
            accounts: {
              assetAccountId: assetAcc,
              depreciationAccountId: depExpAcc,
              fundingAccountId: bankAcc,
            },
            status: "running",
            isDemo: true,
            source: DEMO_SOURCE,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date("2024-03-15T00:00:00.000Z") },
        },
        { upsert: true }
      );
    }
    console.log("Fixed assets verified: 6 assets running.");

    // Balanced Journal Entries (Ensure Debit == Credit for every entry)
    console.log("Seeding balanced Journal Entries for Live Financial Reporting...");
    // First, safely clean up any invalid journal entries with null header.name from prior interrupted runs
    await db.collection("journalentries").deleteMany({
      tenantId: TENANT_ID,
      $or: [{ "header.name": { $in: [null, ""] } }, { "header.name": { $exists: false } }],
    });

    const accountsMap = new Map<string, ObjectId>();
    for (const a of accList) {
      if (a.code) accountsMap.set(String(a.code), a._id);
      if (a.accountNumber) accountsMap.set(String(a.accountNumber), a._id);
    }
    const fallbackAccId = accList[0]?._id || new ObjectId();
    const getAccId = (code: string) => accountsMap.get(code) || fallbackAccId;

    const journalEntries = [
      {
        entryNumber: "JE-DEMO-2026-001",
        date: new Date("2026-08-31"),
        desc: "August 2026 Revenue & Commercial Invoicing Recognition",
        debitAcc: "1100", // Accounts Receivable
        creditAcc: "4000", // Sales Revenue
        amount: 8500000,
      },
      {
        entryNumber: "JE-DEMO-2026-002",
        date: new Date("2026-08-31"),
        desc: "August 2026 Payroll & Staff Benefits Disbursement",
        debitAcc: "6000", // Salaries & Wages Expense
        creditAcc: "1050", // Bank Account
        amount: 5200000,
      },
      {
        entryNumber: "JE-DEMO-2026-003",
        date: new Date("2026-09-30"),
        desc: "September 2026 Enterprise Software & Solution Billing",
        debitAcc: "1100", // Accounts Receivable
        creditAcc: "4000", // Sales Revenue
        amount: 11200000,
      },
      {
        entryNumber: "JE-DEMO-2026-004",
        date: new Date("2026-09-30"),
        desc: "September 2026 Cost of Goods Sold & Direct Material Consumption",
        debitAcc: "5000", // COGS
        creditAcc: "1200", // Inventory Asset
        amount: 4100000,
      },
      {
        entryNumber: "JE-DEMO-2026-005",
        date: new Date("2026-09-30"),
        desc: "September 2026 Facility Rent & Utilities Expense",
        debitAcc: "6200", // Rent & Utilities
        creditAcc: "1050", // Bank Account
        amount: 850000,
      },
      {
        entryNumber: "JE-DEMO-2026-006",
        date: new Date("2026-10-15"),
        desc: "October 2026 High-Volume Sales Deliveries Recognition",
        debitAcc: "1100", // Accounts Receivable
        creditAcc: "4000", // Sales Revenue
        amount: 9400000,
      },
      {
        entryNumber: "JE-DEMO-2026-007",
        date: new Date("2026-10-15"),
        desc: "October 2026 Operational Logistics & Cloud Infrastructure",
        debitAcc: "6100", // Cloud & IT Operations
        creditAcc: "1050", // Bank Account
        amount: 1250000,
      },
    ];

    for (const je of journalEntries) {
      const debitAccId = getAccId(je.debitAcc);
      const creditAccId = getAccId(je.creditAcc);

      await db.collection("journalentries").updateOne(
        { tenantId: TENANT_ID, "header.name": je.entryNumber },
        {
          $set: {
            tenantId: TENANT_ID,
            header: {
              name: je.entryNumber,
              date: je.date,
              ref: je.desc,
              journalType: "general",
            },
            lineIds: [
              {
                accountId: debitAccId,
                label: `${je.desc} - Debit`,
                debit: je.amount,
                credit: 0,
              },
              {
                accountId: creditAccId,
                label: `${je.desc} - Credit`,
                debit: 0,
                credit: je.amount,
              },
            ],
            totals: {
              currencyId: "INR",
              amountUntaxed: je.amount,
              amountTax: 0,
              amountTotal: je.amount,
            },
            status: "posted",
            voucherType: "journal",
            voucherStatus: "validated",
            approvalRequired: false,
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: je.date },
        },
        { upsert: true }
      );
    }
    console.log("Balanced journal entries verified: 7 double-entry journals posted.");

    // ── 9. MANUFACTURING BOMS & MANUFACTURING ORDERS ──
    console.log("\n==> Phase 9: Seeding Manufacturing BOMs & Orders...");
    const solarProd = prodMap["PRD-SOLAR5"] || products[0];
    const bearingProd = prodMap["PRD-BEARING"] || products[1] || products[0];
    const pkgProd = prodMap["PRD-PKG"] || products[2] || products[0];

    // BOM
    let bom = await db.collection("billofmaterials").findOne({ tenantId: TENANT_ID, "header.productId": solarProd._id });
    let bomId = bom?._id;
    if (!bom) {
      const res = await db.collection("billofmaterials").insertOne({
        tenantId: TENANT_ID,
        header: { productId: solarProd._id, bomType: "mrp" },
        components_tab: [
          { productId: bearingProd._id, quantity: 4 },
          { productId: pkgProd._id, quantity: 2 },
        ],
        active: true,
        isDemo: true,
        source: DEMO_SOURCE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      bomId = res.insertedId;
    }
    console.log("BOM verified for Solar Inverter 5kW.");

    // Manufacturing Orders (10 MOs)
    const moDefs = [
      { name: "WH/MO/2026-001", status: "done", qty: 10, date: new Date("2026-08-15") },
      { name: "WH/MO/2026-002", status: "done", qty: 15, date: new Date("2026-09-01") },
      { name: "WH/MO/2026-003", status: "qc_passed", qty: 20, date: new Date("2026-09-20") },
      { name: "WH/MO/2026-004", status: "in_production", qty: 25, date: new Date("2026-10-01") },
      { name: "WH/MO/2026-005", status: "in_production", qty: 30, date: new Date("2026-10-10") },
      { name: "WH/MO/2026-006", status: "draft", qty: 12, date: new Date("2026-10-18") },
      { name: "WH/MO/2026-007", status: "draft", qty: 18, date: new Date("2026-10-22") },
    ];
    for (const mo of moDefs) {
      await db.collection("manufacturingorders").updateOne(
        { tenantId: TENANT_ID, "header.name": mo.name },
        {
          $set: {
            tenantId: TENANT_ID,
            header: {
              name: mo.name,
              productId: solarProd._id,
              quantity: mo.qty,
              bomId,
              scheduledDate: mo.date,
              responsibleId: adminUserId,
            },
            components_tab: [
              { productId: bearingProd._id, toConsume: mo.qty * 4, consumed: mo.status === "done" ? mo.qty * 4 : 0 },
              { productId: pkgProd._id, toConsume: mo.qty * 2, consumed: mo.status === "done" ? mo.qty * 2 : 0 },
            ],
            productionStatus: mo.status,
            status: mo.status === "done" ? "closed" : (mo.status === "in_production" ? "approved" : "draft"),
            reworkCount: 0,
            isDemo: true,
            source: DEMO_SOURCE,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: mo.date },
        },
        { upsert: true }
      );
    }
    console.log("Manufacturing orders verified: 7 MOs.");

    // ── 10. CRM ACCOUNTS, LEADS, OPPORTUNITIES, ACTIVITIES & TASKS ──
    console.log("\n==> Phase 10: Seeding CRM Pipeline, Activities & Follow-ups...");
    // CRM Accounts
    const crmAccDefs = [
      { name: "Tata Steel Logistics Ltd", rev: 250000000, ind: "Manufacturing & Metals" },
      { name: "Reliance Jio Infocomm", rev: 890000000, ind: "Telecommunications & Cloud" },
      { name: "Infosys BPM Tech Services", rev: 450000000, ind: "Information Technology" },
      { name: "Larsen & Toubro Heavy Inf", rev: 620000000, ind: "Heavy Engineering" },
      { name: "Bajaj Auto Distribution", rev: 380000000, ind: "Automotive" },
      { name: "Mahindra Logistics Hub", rev: 290000000, ind: "Transportation & Freight" },
    ];
    const crmAccIds: ObjectId[] = [];
    for (const ca of crmAccDefs) {
      let acc = await db.collection("crmaccounts").findOne({ tenantId: TENANT_ID, name: ca.name });
      if (!acc) {
        const res = await db.collection("crmaccounts").insertOne({
          tenantId: TENANT_ID,
          name: ca.name,
          industry: ca.ind,
          annual_revenue: ca.rev,
          status: "Active",
          owner_id: adminUserId,
          isDemo: true,
          source: DEMO_SOURCE,
          createdBy: adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        crmAccIds.push(res.insertedId);
      } else {
        crmAccIds.push(acc._id);
      }
    }
    console.log(`CRM accounts verified: ${crmAccIds.length}`);

    // CRM Leads (25 leads)
    const leadDefs = [
      { name: "Anil Ambani", company: "Reliance Communications", email: "anil@rcom.demo", status: "Qualified", score: 88, source: "Direct Website" },
      { name: "Sunil Mittal", company: "Bharti Airtel Tech", email: "sunil@airtel.demo", status: "Connected", score: 75, source: "Referral" },
      { name: "Gautam Adani", company: "Adani Green Solutions", email: "gautam@adanigreen.demo", status: "Qualified", score: 92, source: "Event" },
      { name: "Anand Mahindra", company: "Mahindra Defence Logistics", email: "anand@mahindra.demo", status: "Attempting Contact", score: 65, source: "Website Form" },
      { name: "Natarajan Chandrasekaran", company: "Tata Sons Capital", email: "chandra@tata.demo", status: "Qualified", score: 95, source: "Partner Channel" },
      { name: "Sanjiv Bajaj", company: "Bajaj Finserv Asset Hub", email: "sanjiv@bajajfinserv.demo", status: "Connected", score: 70, source: "Social Media" },
      { name: "Harsh Goenka", company: "RPG Enterprises Tech", email: "harsh@rpg.demo", status: "New", score: 50, source: "Direct Website" },
      { name: "Cyrus Mistry", company: "Shapoorji Pallonji EPC", email: "cyrus@shapoorji.demo", status: "Attempting Contact", score: 55, source: "Outbound Calling" },
      { name: "Pawan Munjal", company: "Hero MotoCorp Logistics", email: "pawan@heromoto.demo", status: "Connected", score: 80, source: "Event" },
      { name: "Kiran Mazumdar", company: "Biocon Pharma R&D", email: "kiran@biocon.demo", status: "Qualified", score: 85, source: "Referral" },
    ];
    for (let ld = 0; ld < 25; ld++) {
      const proto = leadDefs[ld % leadDefs.length];
      const leadName = ld < 10 ? proto.name : `${proto.name} (Site ${ld + 1})`;
      const leadEmail = `${proto.email.split("@")[0]}.${ld + 1}@aupulens.demo`;

      await db.collection("crmleads").updateOne(
        { tenantId: TENANT_ID, email: leadEmail },
        {
          $set: {
            tenantId: TENANT_ID,
            lead_name: leadName,
            company_name: proto.company,
            email: leadEmail,
            phone: `+919833${String(100000 + ld).slice(0, 6)}`,
            source: proto.source,
            owner_id: adminUserId,
            status: proto.status,
            priority: ld % 3 === 0 ? "High" : "Medium",
            budget_range: "₹25,00,000 - ₹1,00,00,000",
            lead_score: proto.score - (ld % 10),
            tags: ["Enterprise", "ERP-Modernization"],
            isDemo: true,
            sourceDetail: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (ld * 2) * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("CRM leads verified: 25 leads.");

    // CRM Opportunities (15 opportunities across stages)
    const oppStages = ["Prospecting", "Discovery", "Requirement Gathering", "Proposal Sent", "Negotiation", "Closed Won"];
    for (let op = 1; op <= 15; op++) {
      const oppName = `Enterprise Modernization Deal #${op} - ${crmAccDefs[op % crmAccDefs.length].name.split(" ")[0]}`;
      const stage = oppStages[op % oppStages.length];
      const amt = 1500000 + (op * 650000);
      const prob = stage === "Closed Won" ? 100 : (stage === "Negotiation" ? 80 : (stage === "Proposal Sent" ? 60 : 35));

      await db.collection("crmopportunities").updateOne(
        { tenantId: TENANT_ID, deal_name: oppName },
        {
          $set: {
            tenantId: TENANT_ID,
            deal_name: oppName,
            amount: amt,
            stage,
            probability: prob,
            weighted_value: Math.round(amt * (prob / 100)),
            expected_close_date: new Date(Date.now() + (op * 7) * 86400000),
            account_id: crmAccIds[op % crmAccIds.length],
            owner_id: adminUserId,
            is_at_risk: op % 5 === 0,
            priority: op % 2 === 0 ? "High" : "Medium",
            stage_entered_at: new Date(Date.now() - (op * 2) * 86400000),
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (op * 4) * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("CRM opportunities verified: 15 opportunities.");

    // CRM Activities (30 activities)
    const actTypes = ["Call", "Meeting", "Email", "Quote Sent", "Proposal Discussed"];
    for (let ac = 1; ac <= 30; ac++) {
      const subj = `${actTypes[ac % actTypes.length]} - Requirement Session #${ac}`;
      await db.collection("crmactivities").updateOne(
        { tenantId: TENANT_ID, subject: subj },
        {
          $set: {
            tenantId: TENANT_ID,
            type: actTypes[ac % actTypes.length],
            subject: subj,
            description: `Detailed stakeholder discussion covering ERP deployment timelines, multi-warehouse integrations, and security review.`,
            performed_by_id: adminUserId,
            activity_date: new Date(Date.now() - (ac * 86400000)),
            outcome: "Action items documented and shared with team.",
            linked_account_id: crmAccIds[ac % crmAccIds.length],
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (ac * 86400000)) },
        },
        { upsert: true }
      );
    }
    console.log("CRM activities verified: 30 activities.");

    // CRM Tasks (20 tasks)
    const taskCategories = ["Follow Up", "Schedule Demo", "Send Proposal", "Prepare Meeting", "Call Back"];
    for (let tk = 1; tk <= 20; tk++) {
      const title = `${taskCategories[tk % taskCategories.length]} with ${crmAccDefs[tk % crmAccDefs.length].name}`;
      await db.collection("crmtasks").updateOne(
        { tenantId: TENANT_ID, title },
        {
          $set: {
            tenantId: TENANT_ID,
            title,
            category: taskCategories[tk % taskCategories.length],
            description: "Follow up on pricing approval and technical sign-off.",
            assigned_to_id: adminUserId,
            due_date: new Date(Date.now() + (tk * 2) * 86400000),
            priority: tk % 3 === 0 ? "High" : "Medium",
            status: tk % 4 === 0 ? "Completed" : "Pending",
            linked_account_id: crmAccIds[tk % crmAccIds.length],
            isDemo: true,
            source: DEMO_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - tk * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("CRM tasks verified: 20 tasks.");

    // ── 11. ADMIN MODULE: VERIFY ORG ENTITLEMENTS ──
    console.log("\n==> Phase 11: Verifying Admin Organization Entitlements...");
    await db.collection("organizationentitlements").updateOne(
      { tenantId: TENANT_ID },
      {
        $set: {
          tenantId: TENANT_ID,
          tier: "enterprise",
          enabledModules: ["sales", "inventory", "finance", "manufacturing", "hr", "admin", "crm", "projects"],
          status: "active",
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    console.log("Organization entitlements verified: all 7 enterprise modules enabled.");

    // ── FINAL SUMMARY OF COUNTS ──
    console.log("\n=======================================================");
    console.log("DEMO RESTORATION & SEEDING FINISHED SUCCESSFULLY!");
    console.log("=======================================================");
    const finalReport: Record<string, number> = {};
    const checkCollections = [
      "employees", "departments", "attendances", "leaverequests", "payrolls",
      "warehouses", "stocks", "stockmoves",
      "customers", "salesquotations", "saleorders", "subscriptions",
      "assets", "invoices", "journalentries",
      "billofmaterials", "manufacturingorders",
      "crmaccounts", "crmleads", "crmopportunities", "crmactivities", "crmtasks",
      "users"
    ];
    for (const c of checkCollections) {
      finalReport[c] = await db.collection(c).countDocuments({ tenantId: TENANT_ID });
    }
    console.log("Final Document Counts in default-tenant:", JSON.stringify(finalReport, null, 2));

  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Fatal Seeder Error:", err);
  process.exit(1);
});
