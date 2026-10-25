import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((resolve) => this.ws.addEventListener("open", resolve, { once: true }));
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const task = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) task?.reject(new Error(msg.error.message));
        else task?.resolve(msg.result);
      } else {
        this.handlers.get(msg.method)?.(msg.params);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }
}

async function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, label, timeout = 35000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await pause(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function captureScreenshot(cdp, filepath) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(filepath, Buffer.from(data, "base64"));
  console.log(`Saved screenshot: ${filepath}`);
}

async function main() {
  const MONGO_URI = process.env.MONGODB_URI;
  const BASE_URL = "http://localhost:3000";
  const ARTIFACT_DIR = "/home/krrish/.gemini/antigravity-ide/brain/651689dd-170f-404c-aa67-6775bc7254b5";

  console.log("1. Connecting to database to seed QA tenant, employee, user, and organization...");
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  const tenantId = "qa-tenant";
  const adminEmail = "qa-admin@example.com";
  const password = "Password123!";
  const hashedPassword = await bcrypt.hash(password, 10);

  // 1a. Ensure Organization
  await db.collection("organizations").updateOne(
    { subdomain: tenantId },
    {
      $set: {
        name: "QA Tenant Org",
        subdomain: tenantId,
        isActive: true,
        status: "active",
        subscriptionStatus: "active",
        tier: "enterprise",
        plan: "enterprise",
        settings: {
          ai: {},
          enabledModules: ["admin", "sales", "crm", "finance", "hr", "inventory"],
        },
      },
    },
    { upsert: true }
  );

  // 1b. Ensure Plan
  await db.collection("plans").updateOne(
    { key: "enterprise" },
    {
      $set: {
        key: "enterprise",
        name: "Enterprise Plan",
        features: {
          modules: ["admin", "sales", "crm", "finance", "hr", "inventory"],
          featureFlags: {},
          aiCreditsPerMonth: 50000,
          aiRequestsPerMonth: 50000,
          maxUsers: 100,
          maxCompanies: 10,
          storageGb: 100,
          apiRequestsPerMonth: 50000,
          automationRunsPerMonth: 5000,
          documentLimitPerMonth: 10000,
          supportLevel: "dedicated",
        },
      },
    },
    { upsert: true }
  );

  // 1c. Ensure Admin User
  const adminUserRes = await db.collection("users").findOneAndUpdate(
    { email: adminEmail, tenantId },
    {
      $set: {
        name: "QA Admin",
        email: adminEmail,
        phone: "9999999999",
        password: hashedPassword,
        role: "admin",
        userRole: "admin",
        status: "active",
        tenantId,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  const adminUserId = adminUserRes?._id || (await db.collection("users").findOne({ email: adminEmail, tenantId }))._id;

  // 1d. Ensure Department
  let dept = await db.collection("departments").findOne({ tenantId, code: "SALES" });
  if (!dept) {
    const dRes = await db.collection("departments").insertOne({
      tenantId,
      name: "Sales & Marketing",
      code: "SALES",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    dept = { _id: dRes.insertedId, name: "Sales & Marketing", code: "SALES" };
  }

  // 1e. Clean and seed Employee Kishore
  await db.collection("employees").deleteMany({ tenantId, firstName: "Kishore" });
  const empRes = await db.collection("employees").insertOne({
    tenantId,
    employeeCode: "EMP-001",
    firstName: "Kishore",
    lastName: "Kumar",
    email: "kishore.kumar@qa-tenant.com",
    phone: "9876500001",
    designation: "Sales Manager",
    departmentId: dept._id,
    dateOfJoining: new Date("2025-01-15"),
    employmentType: "full-time",
    salary: {
      basic: 50000,
      hra: 20000,
      da: 5000,
      specialAllowance: 5000,
      grossSalary: 80000,
      deductions: { pf: 1800, esi: 0, professionalTax: 200, tds: 5000, otherDeductions: 0 },
      netSalary: 73000,
    },
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const employeeId = empRes.insertedId;

  // 1f. Clean and seed linked User Kishore
  await db.collection("users").deleteMany({ tenantId, email: "kishore.kumar@qa-tenant.com" });
  const userKishoreRes = await db.collection("users").insertOne({
    tenantId,
    name: "Kishore Kumar",
    email: "kishore.kumar@qa-tenant.com",
    phone: "9876500001",
    password: hashedPassword,
    role: "sales",
    userRole: "sales-manager",
    designation: "Sales Manager",
    employeeId: "EMP-001",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const userKishoreId = userKishoreRes.insertedId;

  await db.collection("employees").updateOne({ _id: employeeId }, { $set: { userId: userKishoreId } });

  // Clean chat histories & command proposals
  await db.collection("chathistories").deleteMany({ tenantId });
  await db.collection("aicommandproposals").deleteMany({ tenantId });
  await db.collection("crmauditlogs").deleteMany({ tenantId, record_id: employeeId });

  console.log("Seeding complete. Initial employee state verified:");
  console.log(`- Employee ID: ${employeeId}, Code: EMP-001, Designation: Sales Manager`);
  console.log(`- Linked User ID: ${userKishoreId}, Role: sales, UserRole: sales-manager`);

  console.log("2. Launching headless Chrome...");
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1280,950",
    "--remote-debugging-port=9231",
  ]);

  try {
    await waitFor(async () => {
      const r = await fetch("http://127.0.0.1:9231/json/version");
      return r.ok;
    }, "Chrome debugger ready", 10000);

    const target = await (await fetch("http://127.0.0.1:9231/json/new?about:blank", { method: "PUT" })).json();
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    console.log("3. Navigating to auth page...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/auth` });
    await waitFor(() => cdp.evaluate("location.origin === " + JSON.stringify(BASE_URL)), "Auth page load");

    console.log("4. Logging in as QA Admin user...");
    const loginResult = await cdp.evaluate(`(async () => {
      const csrfRes = await fetch('/api/auth/csrf');
      const { csrfToken } = await csrfRes.json();
      const res = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
        body: new URLSearchParams({
          csrfToken,
          email: 'qa-admin@example.com',
          password: 'Password123!',
          tenantId: 'qa-tenant'
        })
      });
      return res.status;
    })()`);
    console.log("Login HTTP status:", loginResult);

    console.log("5. Navigating to Sales AI Assistant (/sales/ai-assistant)...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/sales/ai-assistant` });
    await pause(2000);

    await waitFor(() => cdp.evaluate("!!document.querySelector('textarea')"), "Textarea visible");
    console.log("Sales AI Assistant loaded successfully!");

    // Helper to send message
    async function sendMessage(text) {
      console.log(`Sending message: "${text.slice(0, 80)}..."`);
      await cdp.evaluate(`(() => {
        const textarea = document.querySelector('textarea');
        if (!textarea) throw new Error("No textarea found");
        textarea.focus();
        textarea.select();
      })()`);
      await pause(200);

      await cdp.send("Input.insertText", { text });
      await pause(400);

      await waitFor(async () => {
        return await cdp.evaluate(`(() => {
          const btn = document.querySelector('button[type="submit"]');
          return btn && !btn.disabled;
        })()`);
      }, "Submit button enabled", 5000);

      await cdp.evaluate(`(() => {
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      })()`);
      console.log("Submit button clicked.");
    }

    async function waitForAssistantReply() {
      console.log("Waiting for assistant response...");
      await pause(1000);
      await waitFor(async () => {
        const isThinking = await cdp.evaluate(`(() => {
          return document.body.innerText.includes('Thinking...') || !!document.querySelector('.animate-spin');
        })()`);
        return !isThinking;
      }, "Assistant reply completed", 35000);
      await pause(1500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERACTION 1: Employee Lookup
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n=================== INTERACTION 1: EMPLOYEE LOOKUP ===================");
    const lookupPrompt = "Find existing employees named Kishore in my current organization. Return their employee ID, full name, current role or designation, and department. Do not create or modify any employee.";
    await sendMessage(lookupPrompt);
    await waitForAssistantReply();

    const turn1Dom = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      const url = window.location.href;
      return {
        url,
        hasKishore: text.includes('Kishore Kumar') || text.includes('Kishore'),
        hasEmpCode: text.includes('EMP-001'),
        hasSalesManager: text.includes('Sales Manager'),
        hasDept: text.includes('Sales & Marketing') || text.includes('Sales'),
        hasAddEmployeeForm: text.includes('Add New Employee') || url.includes('/hr/employees'),
        textSnippet: text.slice(text.length - 2000),
      };
    })()`);

    console.log("Interaction 1 Checks:", {
      url: turn1Dom.url,
      hasKishore: turn1Dom.hasKishore,
      hasEmpCode: turn1Dom.hasEmpCode,
      hasSalesManager: turn1Dom.hasSalesManager,
      hasDept: turn1Dom.hasDept,
      hasAddEmployeeForm: turn1Dom.hasAddEmployeeForm,
    });
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/browser_turn1_employee_lookup.png`);

    if (turn1Dom.hasAddEmployeeForm) {
      throw new Error("REGRESSION: Interaction 1 redirected to Add New Employee form!");
    }
    if (!turn1Dom.hasKishore || !turn1Dom.hasEmpCode || !turn1Dom.hasSalesManager) {
      console.log("Interaction 1 Page Text:\n", turn1Dom.textSnippet);
      throw new Error("Interaction 1 failed: Expected Kishore employee details in assistant response.");
    }
    const empCountTurn1 = await db.collection("employees").countDocuments({ tenantId });
    if (empCountTurn1 !== 1) {
      throw new Error(`Unexpected employee creation during lookup! Count = ${empCountTurn1}`);
    }
    console.log("Interaction 1 verified: Lookup succeeded without opening Add New Employee form!");

    // ─────────────────────────────────────────────────────────────────────────
    // INTERACTION 2: Prepare Role Change
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n=================== INTERACTION 2: PREPARE ROLE CHANGE ===================");
    const preparePrompt = "I want to change employee Kishore's role from Sales Manager to Admin. Identify the exact employee in my current organization, check my permissions, and prepare the role change for confirmation. Do not make any changes yet. If you cannot execute role changes through an authorized backend action, tell me explicitly.";
    await sendMessage(preparePrompt);
    await waitForAssistantReply();

    const turn2Dom = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      const url = window.location.href;
      return {
        url,
        hasProposalCard: text.includes('Role Change Proposal') || text.includes('Change Role') || text.includes('Target Employee') || text.includes('confirm role change'),
        hasTargetEmployee: text.includes('Kishore Kumar') && text.includes('EMP-001'),
        hasCurrentRole: text.includes('Sales Manager'),
        hasProposedRole: text.includes('Admin') || text.includes('admin'),
        hasAddEmployeeForm: text.includes('Add New Employee') || url.includes('/hr/employees'),
        textSnippet: text.slice(text.length - 2500),
      };
    })()`);

    console.log("Interaction 2 Checks:", {
      url: turn2Dom.url,
      hasProposalCard: turn2Dom.hasProposalCard,
      hasTargetEmployee: turn2Dom.hasTargetEmployee,
      hasCurrentRole: turn2Dom.hasCurrentRole,
      hasProposedRole: turn2Dom.hasProposedRole,
      hasAddEmployeeForm: turn2Dom.hasAddEmployeeForm,
    });
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/browser_turn2_role_change_proposal.png`);

    if (turn2Dom.hasAddEmployeeForm) {
      throw new Error("CRITICAL DEFECT: Interaction 2 redirected to Add New Employee form!");
    }
    if (!turn2Dom.hasProposalCard) {
      console.log("Interaction 2 Page Text:\n", turn2Dom.textSnippet);
      throw new Error("Interaction 2 failed: Missing role change proposal card.");
    }

    // Verify DB was NOT mutated before confirmation
    const empBeforeConfirm = await db.collection("employees").findOne({ _id: employeeId });
    const userBeforeConfirm = await db.collection("users").findOne({ _id: userKishoreId });
    console.log("Pre-confirmation DB check:");
    console.log(`- Employee designation: "${empBeforeConfirm.designation}" (expected: "Sales Manager")`);
    console.log(`- User role: "${userBeforeConfirm.role}" (expected: "sales")`);

    if (empBeforeConfirm.designation !== "Sales Manager" || userBeforeConfirm.role !== "sales") {
      throw new Error("Premature database mutation detected before confirmation!");
    }
    console.log("Interaction 2 verified: Proposal prepared without mutation and without opening employee form!");

    // ─────────────────────────────────────────────────────────────────────────
    // INTERACTION 3: Confirm Role Change
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n=================== INTERACTION 3: CONFIRM ROLE CHANGE ===================");
    const confirmPrompt = "confirm role change";
    await sendMessage(confirmPrompt);
    await waitForAssistantReply();

    const turn3Dom = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      const url = window.location.href;
      return {
        url,
        hasSuccessMessage: text.includes('Successfully updated role for employee') || text.includes('Role Changed') || (text.includes('Admin') && text.includes('Kishore Kumar')),
        hasAddEmployeeForm: text.includes('Add New Employee') || url.includes('/hr/employees'),
        textSnippet: text.slice(text.length - 2500),
      };
    })()`);

    console.log("Interaction 3 Checks:", {
      url: turn3Dom.url,
      hasSuccessMessage: turn3Dom.hasSuccessMessage,
      hasAddEmployeeForm: turn3Dom.hasAddEmployeeForm,
    });
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/browser_turn3_role_change_confirmed.png`);

    if (turn3Dom.hasAddEmployeeForm) {
      throw new Error("Interaction 3 redirected to Add New Employee form!");
    }
    if (!turn3Dom.hasSuccessMessage) {
      console.log("Interaction 3 Page Text:\n", turn3Dom.textSnippet);
      throw new Error("Interaction 3 failed: Confirmation message not displayed.");
    }

    // Verify DB persistence on both Employee and User
    const empAfterConfirm = await db.collection("employees").findOne({ _id: employeeId });
    const userAfterConfirm = await db.collection("users").findOne({ _id: userKishoreId });
    const auditLog = await db.collection("crmauditlogs").findOne({
      tenantId,
      record_type: "Employee",
      record_id: employeeId,
      action: "updated",
    });

    console.log("Post-confirmation DB verification:");
    console.log(`- Employee designation: "${empAfterConfirm.designation}" (expected: "Admin")`);
    console.log(`- User role: "${userAfterConfirm.role}", userRole: "${userAfterConfirm.userRole}", designation: "${userAfterConfirm.designation}" (expected: "admin")`);
    console.log(`- Audit log record:`, auditLog ? { action: auditLog.action, old: auditLog.old_value, new: auditLog.new_value } : "MISSING");

    if (empAfterConfirm.designation !== "Admin") {
      throw new Error(`Employee designation was not persisted! Got "${empAfterConfirm.designation}"`);
    }
    if (userAfterConfirm.role !== "admin" || userAfterConfirm.userRole !== "admin" || userAfterConfirm.designation !== "Admin") {
      throw new Error(`User account role was not persisted! Got role="${userAfterConfirm.role}", userRole="${userAfterConfirm.userRole}"`);
    }
    if (!auditLog || auditLog.new_value !== "Admin") {
      throw new Error("Audit log entry for role change was not created!");
    }
    console.log("Interaction 3 verified: Role change executed, persisted in both models, and audited!");

    // ─────────────────────────────────────────────────────────────────────────
    // INTERACTION 4: Replay Protection
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n=================== INTERACTION 4: REPLAY PROTECTION ===================");
    await sendMessage("confirm role change");
    await waitForAssistantReply();

    const turn4Dom = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      return {
        hasAlreadyUpdated: text.includes('already been updated') || text.includes('No pending role change proposal') || text.includes('Admin'),
        textSnippet: text.slice(text.length - 1500),
      };
    })()`);

    console.log("Interaction 4 Checks:", {
      hasAlreadyUpdated: turn4Dom.hasAlreadyUpdated,
    });
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/browser_turn4_replay_protection.png`);

    const auditCountAfterReplay = await db.collection("crmauditlogs").countDocuments({
      tenantId,
      record_type: "Employee",
      record_id: employeeId,
    });
    console.log("Audit log count after replay:", auditCountAfterReplay);
    if (auditCountAfterReplay !== 1) {
      throw new Error(`Replay protection failed: audit log duplicated! Count = ${auditCountAfterReplay}`);
    }
    console.log("Interaction 4 verified: Replay handled gracefully without duplicate execution or logs!");

    console.log("\n========================================================");
    console.log("ALL BROWSER E2E VERIFICATIONS PASSED FLAWLESSLY!");
    console.log("========================================================");
  } finally {
    try {
      chrome.kill("SIGKILL");
    } catch {}
    // Clean up QA seeded records
    console.log("Cleaning up QA tenant database records...");
    await db.collection("employees").deleteMany({ tenantId });
    await db.collection("users").deleteMany({ tenantId });
    await db.collection("departments").deleteMany({ tenantId });
    await db.collection("organizations").deleteMany({ subdomain: tenantId });
    await db.collection("chathistories").deleteMany({ tenantId });
    await db.collection("aicommandproposals").deleteMany({ tenantId });
    await db.collection("crmauditlogs").deleteMany({ tenantId });
    await mongoose.disconnect();
    console.log("Cleanup complete and database disconnected.");
  }
}

main().catch((err) => {
  console.error("FATAL BROWSER VERIFICATION ERROR:", err);
  process.exit(1);
});
