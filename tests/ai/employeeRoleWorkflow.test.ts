import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

const commandAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: commandAuth }));
vi.mock("@/lib/db", () => ({ default: async () => {} }));

import Organization from "@/models/admin/Organization";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import User from "@/models/auth/User";
import ChatHistory from "@/models/ai/ChatHistory";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { tryErpAssistant } from "@/lib/ai/erpAssistant";
import { parseErpIntent } from "@/lib/ai/erpIntent";
import { findCreateTarget } from "@/lib/ai/createTargets";
import { COMMAND_ACTIONS, CommandActionError } from "@/lib/ai/commandActions";

import { seedPlans } from "@/lib/platform/entitlements/planCatalog";

const mongoUri = process.env.MONGODB_URI || `mongodb://127.0.0.1:27017/aupulens_test_emp_${randomUUID().replaceAll("-", "")}`;

beforeAll(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    Organization.init(),
    Employee.init(),
    Department.init(),
    User.init(),
    ChatHistory.init(),
    AiCommandProposal.init(),
    CrmAuditLog.init(),
  ]);
  await seedPlans();
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Aupulens AI Employee Role Workflow & Intent Isolation (Tests A - K)", () => {
  const tenantA = `org-test-a-${randomUUID().slice(0, 8)}`;
  const tenantB = `org-test-b-${randomUUID().slice(0, 8)}`;
  const adminAId = new mongoose.Types.ObjectId().toString();
  const adminBId = new mongoose.Types.ObjectId().toString();
  const salesUserAId = new mongoose.Types.ObjectId().toString();

  let deptSalesA: any;
  let employeeKishoreA: any;
  let userKishoreA: any;

  beforeAll(async () => {
    // Organizations for tenant isolation
    await Organization.create({
      name: "Tenant A Organization",
      subdomain: tenantA,
      ownerUserId: adminAId,
      plan: "enterprise",
      status: "active",
    });

    await Organization.create({
      name: "Tenant B Organization",
      subdomain: tenantB,
      ownerUserId: adminBId,
      plan: "enterprise",
      status: "active",
    });

    // Admin user for Tenant A
    await User.create({
      _id: new mongoose.Types.ObjectId(adminAId),
      name: "Tenant A Admin",
      email: "admin@tenanta.com",
      phone: "9876543210",
      password: "password123",
      role: "admin",
      userRole: "admin",
      tenantId: tenantA,
      status: "active",
    });

    // Admin user for Tenant B
    await User.create({
      _id: new mongoose.Types.ObjectId(adminBId),
      name: "Tenant B Admin",
      email: "admin@tenantb.com",
      phone: "9876543212",
      password: "password123",
      role: "admin",
      userRole: "admin",
      tenantId: tenantB,
      status: "active",
    });

    // Sales user for Tenant A (Unauthorized for role mutations)
    await User.create({
      _id: new mongoose.Types.ObjectId(salesUserAId),
      name: "Tenant A Sales User",
      email: "sales@tenanta.com",
      phone: "9876543211",
      password: "password123",
      role: "sales",
      userRole: "sales-executive",
      tenantId: tenantA,
      status: "active",
    });

    // Department in Tenant A
    deptSalesA = await Department.create({
      tenantId: tenantA,
      name: "Sales & Marketing",
      code: "SALES",
      isActive: true,
    });

    // Existing test employee Kishore in Tenant A
    employeeKishoreA = await Employee.create({
      tenantId: tenantA,
      employeeCode: "EMP-001",
      firstName: "Kishore",
      lastName: "Kumar",
      email: "kishore.kumar@tenanta.com",
      phone: "9876500001",
      designation: "Sales Manager",
      departmentId: deptSalesA._id,
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
    });

    // Linked user account for Kishore in Tenant A
    userKishoreA = await User.create({
      name: "Kishore Kumar",
      email: "kishore.kumar@tenanta.com",
      phone: "9876500001",
      password: "password123",
      role: "sales",
      userRole: "sales-manager",
      designation: "Sales Manager",
      employeeId: employeeKishoreA.employeeCode,
      tenantId: tenantA,
      status: "active",
    });

    // Link user to employee
    employeeKishoreA.userId = userKishoreA._id;
    await employeeKishoreA.save();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test A — Employee lookup
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test A: searches for existing employee Kishore without creating an employee or opening Add New Employee", async () => {
    const q = "Find existing employees named Kishore in my current organization. Return their employee ID, full name, current role or designation, and department. Do not create or modify any employee.";

    // 1. Verify findCreateTarget returns undefined (does not open Add New Employee form)
    const createTarget = findCreateTarget(q);
    expect(createTarget).toBeUndefined();

    // 2. Parse intent
    const intent = parseErpIntent(q);
    expect(intent).toEqual({ type: "employee_lookup", name: "Kishore" });

    // 3. Count employees before
    const countBefore = await Employee.countDocuments({ tenantId: tenantA });

    // 4. Run assistant
    const convId = randomUUID();
    const res = await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: q,
      requestId: randomUUID(),
    });

    expect(res).toBeDefined();
    expect(res?.handled).toBe(true);
    expect(res?.message).toContain("Kishore Kumar");
    expect(res?.message).toContain("EMP-001");
    expect(res?.message).toContain("Sales Manager");
    expect(res?.message).toContain("Sales & Marketing");

    // 5. Verify no employee was created
    const countAfter = await Employee.countDocuments({ tenantId: tenantA });
    expect(countAfter).toBe(countBefore);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B — No matching employee
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test B: searches for unique nonexistent employee; reports no match and does not open creation form or mutate database", async () => {
    const q = "Find existing employees named NonExistentXYZ999 in my current organization.";

    // 1. findCreateTarget must be undefined
    expect(findCreateTarget(q)).toBeUndefined();

    // 2. Parse intent
    const intent = parseErpIntent(q);
    expect(intent).toEqual({ type: "employee_lookup", name: "NonExistentXYZ999" });

    // 3. Count employees before
    const countBefore = await Employee.countDocuments({ tenantId: tenantA });

    // 4. Run assistant
    const convId = randomUUID();
    const res = await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: q,
      requestId: randomUUID(),
    });

    expect(res).toBeDefined();
    expect(res?.handled).toBe(true);
    expect(res?.structured?.type).toBe("not_found");
    expect(res?.message).toContain("No matching employee found");

    // 5. No mutation occurred
    const countAfter = await Employee.countDocuments({ tenantId: tenantA });
    expect(countAfter).toBe(countBefore);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C — Ambiguous employee name
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test C: handles ambiguous employee name by requesting clarification instead of guessing", async () => {
    // Create second employee named Kishore in Tenant A
    const secondKishore = await Employee.create({
      tenantId: tenantA,
      employeeCode: "EMP-002",
      firstName: "Kishore",
      lastName: "Sharma",
      email: "kishore.sharma@tenanta.com",
      phone: "9876500002",
      designation: "HR Executive",
      departmentId: deptSalesA._id,
      dateOfJoining: new Date("2025-02-01"),
      employmentType: "full-time",
      salary: {
        basic: 40000,
        hra: 15000,
        da: 4000,
        specialAllowance: 3000,
        grossSalary: 62000,
        deductions: { pf: 1800, esi: 0, professionalTax: 200, tds: 3000, otherDeductions: 0 },
        netSalary: 57000,
      },
      status: "active",
    });

    try {
      const q = "Find existing employees named Kishore in my current organization.";
      const convId = randomUUID();
      const res = await tryErpAssistant({
        tenantId: tenantA,
        userId: adminAId,
        role: "admin",
        module: "admin",
        conversationId: convId,
        text: q,
        requestId: randomUUID(),
      });

      expect(res).toBeDefined();
      expect(res?.handled).toBe(true);
      expect(res?.structured?.type).toBe("clarification");
      expect(res?.message).toContain("EMP-001");
      expect(res?.message).toContain("EMP-002");
      expect(res?.message).toContain("disambiguate");

      // Verify neither employee was modified
      const emp1 = await Employee.findById(employeeKishoreA._id).lean();
      const emp2 = await Employee.findById(secondKishore._id).lean();
      expect(emp1?.designation).toBe("Sales Manager");
      expect(emp2?.designation).toBe("HR Executive");
    } finally {
      // Clean up second Kishore so subsequent tests have unique Kishore Kumar
      await Employee.deleteOne({ _id: secondKishore._id });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D — Prepare role change
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test D: prepares role change (Sales Manager -> Admin) with employee ID, awaits confirmation, and does not mutate record before confirmation", async () => {
    const q = "I want to change employee Kishore's role from Sales Manager to Admin. Identify the exact employee in my current organization, check my permissions, and prepare the role change for confirmation. Do not make any changes yet. If you cannot execute role changes through an authorized backend action, tell me explicitly.";

    // 1. findCreateTarget must NOT redirect to Add New Employee
    const createTarget = findCreateTarget(q);
    expect(createTarget).toBeUndefined();

    // 2. Parse intent
    const intent = parseErpIntent(q);
    expect(intent).toEqual({
      type: "role_change",
      userName: "Kishore",
      role: "Admin",
      fromRole: "Sales Manager",
    });

    // 3. Run assistant to prepare proposal
    const convId = randomUUID();
    const res = await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: q,
      requestId: randomUUID(),
    });

    expect(res).toBeDefined();
    expect(res?.handled).toBe(true);
    expect(res?.structured?.type).toBe("role_change_proposal");

    const proposalStructured = res?.structured as any;
    expect(proposalStructured.employeeId).toBe(String(employeeKishoreA._id));
    expect(proposalStructured.employeeCode).toBe("EMP-001");
    expect(proposalStructured.currentRole).toBe("Sales Manager");
    expect(proposalStructured.proposedRole).toBe("admin");
    expect(proposalStructured.status).toBe("proposed");

    // 4. Verify employee record in DB is UNCHANGED before confirmation
    const empAfterPrep = await Employee.findById(employeeKishoreA._id).lean();
    expect(empAfterPrep?.designation).toBe("Sales Manager");

    const userAfterPrep = await User.findById(userKishoreA._id).lean();
    expect(userAfterPrep?.role).toBe("sales");
    expect(userAfterPrep?.userRole).toBe("sales-manager");

    // 5. Verify proposal was saved in DB with PROPOSED status
    const savedProposal = await AiCommandProposal.findById(proposalStructured.proposalId).lean();
    expect(savedProposal).toBeDefined();
    expect(savedProposal?.status).toBe("proposed");
    expect(savedProposal?.params?.employeeId).toBe(String(employeeKishoreA._id));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E — Authorized confirmation
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test E: authorized confirmation executes the role change, updates both Employee and linked User, verifies persistence, and returns verified status", async () => {
    const convId = randomUUID();

    // Step 1: Prepare proposal
    const prepRes = await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: "change employee Kishore's role from Sales Manager to Admin",
      requestId: randomUUID(),
    });
    expect(prepRes?.structured?.type).toBe("role_change_proposal");

    // Step 2: Confirm proposal as authorized admin
    const confirmRes = await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: "confirm role change",
      requestId: randomUUID(),
    });

    expect(confirmRes).toBeDefined();
    expect(confirmRes?.handled).toBe(true);
    expect(confirmRes?.structured?.type).toBe("role_changed");
    expect(confirmRes?.message).toContain("Successfully updated role for employee");
    expect(confirmRes?.message).toContain("Admin");

    // Step 3: Verify employee in DB was actually updated
    const updatedEmp = await Employee.findById(employeeKishoreA._id).lean();
    expect(updatedEmp?.designation).toBe("Admin");

    // Step 4: Verify linked User in DB was actually updated
    const updatedUser = await User.findById(userKishoreA._id).lean();
    expect(updatedUser?.role).toBe("admin");
    expect(updatedUser?.userRole).toBe("admin");
    expect(updatedUser?.designation).toBe("Admin");

    // Step 5: Verify CRM audit log was recorded
    const auditLog = await CrmAuditLog.findOne({
      tenantId: tenantA,
      record_type: "Employee",
      record_id: employeeKishoreA._id,
      action: "updated",
    }).lean();
    expect(auditLog).toBeDefined();
    expect(auditLog?.old_value).toBe("Sales Manager");
    expect(auditLog?.new_value).toBe("Admin");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F — Unauthorized confirmation
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test F: unauthorized user attempting role change is rejected with 403 PERMISSION_DENIED and record remains unchanged", async () => {
    // Reset Kishore's role back to Sales Manager
    await Employee.updateOne({ _id: employeeKishoreA._id }, { $set: { designation: "Sales Manager" } });
    await User.updateOne({ _id: userKishoreA._id }, { $set: { role: "sales", userRole: "sales-manager", designation: "Sales Manager" } });

    const convId = randomUUID();

    // Sales user attempts to prepare/execute a role change
    await expect(
      tryErpAssistant({
        tenantId: tenantA,
        userId: salesUserAId,
        role: "sales", // Unauthorized role
        module: "sales",
        conversationId: convId,
        text: "change employee Kishore's role from Sales Manager to Admin",
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      status: 403,
    });

    // Record remains completely unchanged
    const emp = await Employee.findById(employeeKishoreA._id).lean();
    expect(emp?.designation).toBe("Sales Manager");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G — Cross-tenant isolation
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test G: cross-tenant isolation prevents looking up or modifying employees belonging to another tenant", async () => {
    // 1. Employee lookup in Tenant B for Kishore (who belongs to Tenant A)
    const lookupRes = await tryErpAssistant({
      tenantId: tenantB, // Other tenant
      userId: adminBId,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: "Find existing employees named Kishore in my current organization.",
      requestId: randomUUID(),
    });

    expect(lookupRes?.structured?.type).toBe("not_found");
    expect(lookupRes?.message).toContain("No matching employee found");

    // 2. Direct mutation attempt targeting Tenant A employee using Tenant B admin credentials
    await expect(
      COMMAND_ACTIONS.update_user_role.execute(
        { employeeId: String(employeeKishoreA._id), proposedRole: "admin" },
        tenantB, // Tenant B attempted to mutate Tenant A employee
        adminBId
      )
    ).rejects.toThrow("Employee record not found in current organization");

    // Verify Tenant A employee was untouched
    const emp = await Employee.findById(employeeKishoreA._id).lean();
    expect(emp?.designation).toBe("Sales Manager");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test H — Duplicate confirmation replay prevention
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test H: replaying the same confirmation does not apply the change twice or produce duplicate logs", async () => {
    const convId = randomUUID();

    // Step 1: Prepare proposal
    await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: "change employee Kishore's role to Admin",
      requestId: randomUUID(),
    });

    // Step 2: First confirmation
    const firstConfirm = await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: "confirm role change",
      requestId: randomUUID(),
    });
    expect(firstConfirm?.structured?.type).toBe("role_changed");

    const auditCountBefore = await CrmAuditLog.countDocuments({
      tenantId: tenantA,
      record_id: employeeKishoreA._id,
      new_value: "Admin",
    });

    // Step 3: Replay duplicate confirmation on same conversation
    const chat = await ChatHistory.findOne({ conversationId: convId });
    // Manually set pendingRoleProposalId back to the executed proposal to simulate a replayed request
    const proposal = await AiCommandProposal.findOne({ tenantId: tenantA, userId: adminAId, actionType: "update_user_role" }).sort({ createdAt: -1 });
    await ChatHistory.updateOne({ _id: chat?._id }, { $set: { pendingRoleProposalId: String(proposal?._id) } });

    const secondConfirm = await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: "confirm role change",
      requestId: randomUUID(),
    });

    expect(secondConfirm?.message).toContain("already been updated");

    // Verify audit logs were not duplicated
    const auditCountAfter = await CrmAuditLog.countDocuments({
      tenantId: tenantA,
      record_id: employeeKishoreA._id,
      new_value: "Admin",
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test I — Invalid or stale proposal detection
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test I: detects stale precondition when employee role changes after preparation, rejecting outdated proposal", async () => {
    // Reset Kishore's role to Sales Manager
    await Employee.updateOne({ _id: employeeKishoreA._id }, { $set: { designation: "Sales Manager" } });

    const convId = randomUUID();

    // Prepare role change proposal (Sales Manager -> Admin)
    const prepRes = await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: "change employee Kishore's role from Sales Manager to Admin",
      requestId: randomUUID(),
    });
    expect(prepRes?.structured?.type).toBe("role_change_proposal");

    // Out-of-band mutation: HR changes Kishore's role to "VP of Sales" directly
    await Employee.updateOne({ _id: employeeKishoreA._id }, { $set: { designation: "VP of Sales" } });

    // Confirm the stale proposal
    await expect(
      tryErpAssistant({
        tenantId: tenantA,
        userId: adminAId,
        role: "admin",
        module: "admin",
        conversationId: convId,
        text: "confirm role change",
        requestId: randomUUID(),
      })
    ).rejects.toThrow("Precondition failed: Employee's role/designation has changed");

    // The newer state ("VP of Sales") was not overwritten by stale proposal
    const emp = await Employee.findById(employeeKishoreA._id).lean();
    expect(emp?.designation).toBe("VP of Sales");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test J — Failure path handling
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test J: handles execution failure truthfully without claiming success when persistence fails", async () => {
    // Reset Kishore to Sales Manager
    await Employee.updateOne({ _id: employeeKishoreA._id }, { $set: { designation: "Sales Manager" } });

    const convId = randomUUID();

    // Prepare proposal
    await tryErpAssistant({
      tenantId: tenantA,
      userId: adminAId,
      role: "admin",
      module: "admin",
      conversationId: convId,
      text: "change employee Kishore's role from Sales Manager to Admin",
      requestId: randomUUID(),
    });

    // Mock Employee.findOne inside execute to simulate persistence failure
    const originalFindOne = Employee.findOne;
    const findOneSpy = vi.spyOn(Employee, "findOne").mockImplementation(function (this: any, filter: any) {
      // Allow initial fetch, but return mismatched designation on verification fetch
      if (filter?._id && filter?.tenantId && !filter?.designation) {
        return {
          lean: () => Promise.resolve({ _id: employeeKishoreA._id, designation: "UNPERSISTED_STATE" }),
          populate: () => ({ lean: () => Promise.resolve(null) }),
          save: () => Promise.resolve(),
        } as any;
      }
      return originalFindOne.call(this, filter);
    });

    await expect(
      tryErpAssistant({
        tenantId: tenantA,
        userId: adminAId,
        role: "admin",
        module: "admin",
        conversationId: convId,
        text: "confirm role change",
        requestId: randomUUID(),
      })
    ).rejects.toThrow();

    findOneSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test K — Explicit employee creation regression
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test K: explicit employee creation request still triggers employee creation target, while lookups and updates do not", () => {
    // 1. Explicit creation requests
    const createReq1 = "create a new employee named John Doe in sales";
    const target1 = findCreateTarget(createReq1);
    expect(target1).toBeDefined();
    expect(target1?.target).toBe("employee");
    expect(target1?.route).toBe("/hr/employees");

    const createReq2 = "add employee Jane Smith";
    const target2 = findCreateTarget(createReq2);
    expect(target2).toBeDefined();
    expect(target2?.target).toBe("employee");

    const createReq3 = "onboard new staff member Robert";
    const target3 = findCreateTarget(createReq3);
    expect(target3).toBeDefined();
    expect(target3?.target).toBe("employee");

    // 2. Lookup requests must NOT trigger creation target
    expect(findCreateTarget("Find existing employees named Kishore in my current organization.")).toBeUndefined();
    expect(findCreateTarget("Search for employee Kishore")).toBeUndefined();
    expect(findCreateTarget("Who are the employees in sales?")).toBeUndefined();
    expect(findCreateTarget("List all employees")).toBeUndefined();

    // 3. Role update requests must NOT trigger creation target
    expect(findCreateTarget("I want to change employee Kishore's role from Sales Manager to Admin. Prepare the role change for confirmation. Do not make any changes yet.")).toBeUndefined();
    expect(findCreateTarget("change employee Kishore role to Admin")).toBeUndefined();
    expect(findCreateTarget("update role of employee Kishore to Admin")).toBeUndefined();
  });
});
