import connectDB from "../lib/db";
import { GET as getEmployees } from "../app/api/hr/employees/route";
import { GET as getSalesOrders } from "../app/api/sales/orders/route";
import { GET as getCrmLeads } from "../app/api/crm/leads/route";
import { GET as getCrmOpps } from "../app/api/crm/opportunities/route";
import { GET as getCrmActivities } from "../app/api/crm/activities/route";
import { GET as getCrmTasks } from "../app/api/crm/tasks/route";
import { GET as getAdminDashboard } from "../app/api/admin/dashboard/route";
import { NextRequest } from "next/server";
import * as authModule from "@/auth";
import { vi } from "vitest";

// We will invoke the route handler functions directly with mocked NextAuth session
async function main() {
  await connectDB();
  const tenantId = "default-tenant";

  console.log("==========================================================");
  console.log("EXECUTING FULL MODULE API ROUTE FUNCTIONALITY AUDIT");
  console.log("==========================================================");

  const adminSession = {
    user: { id: "admin-1", email: "admin@aupulens.com", role: "admin", tenantId },
  };
  const salesSession = {
    user: { id: "sales-1", email: "david@aupulens.com", role: "sales", tenantId },
  };

  // Helper to test a route with a given session
  async function testRoute(name: string, handler: (req: NextRequest) => Promise<Response>, url: string, session: any) {
    (authModule as any).auth = async () => session;
    const req = new NextRequest(new URL(url, "http://localhost:3000"));
    const res = await handler(req);
    const status = res.status;
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status, data };
  }

  // 1. HR Employees
  console.log("\n[1] Testing HR Employees Route (/api/hr/employees)...");
  const hrAdmin = await testRoute("HR Admin", getEmployees, "/api/hr/employees", adminSession);
  console.log(`  Admin status: ${hrAdmin.status}, total records: ${hrAdmin.data?.employees?.length ?? hrAdmin.data?.length ?? 0}`);
  if (hrAdmin.status !== 200) throw new Error(`HR Admin route failed: ${hrAdmin.status}`);

  const hrSales = await testRoute("HR Non-Admin", getEmployees, "/api/hr/employees", salesSession);
  console.log(`  Non-Admin status: ${hrSales.status}, total records: ${hrSales.data?.employees?.length ?? hrSales.data?.length ?? 0}`);
  if (hrSales.status !== 200) throw new Error(`HR Non-admin route failed: ${hrSales.status}`);
  const nonAdminLeaked = (hrSales.data?.employees || []).filter((e: any) => e.isDemo);
  if (nonAdminLeaked.length > 0) throw new Error(`SECURITY BREACH: Non-admin received ${nonAdminLeaked.length} demo employees!`);
  console.log("  ✓ HR route returns 200 and enforces demo isolation.");

  // 2. Sales Orders
  console.log("\n[2] Testing Sales Orders Route (/api/sales/orders)...");
  const soAdmin = await testRoute("Sales Admin", getSalesOrders, "/api/sales/orders", adminSession);
  console.log(`  Admin status: ${soAdmin.status}, count: ${soAdmin.data?.data?.length ?? soAdmin.data?.length ?? 0}`);
  if (soAdmin.status !== 200) throw new Error(`Sales orders admin route failed: ${soAdmin.status}`);

  const soSales = await testRoute("Sales Non-Admin", getSalesOrders, "/api/sales/orders", salesSession);
  console.log(`  Non-Admin status: ${soSales.status}, count: ${soSales.data?.data?.length ?? soSales.data?.length ?? 0}`);
  if (soSales.status !== 200) throw new Error(`Sales orders non-admin route failed: ${soSales.status}`);
  const nonAdminOrdersLeaked = (soSales.data?.data || []).filter((o: any) => o.isDemo);
  if (nonAdminOrdersLeaked.length > 0) throw new Error(`SECURITY BREACH: Non-admin received demo orders!`);
  console.log("  ✓ Sales orders route returns 200 and enforces demo isolation.");

  // 3. CRM Leads
  console.log("\n[3] Testing CRM Leads Route (/api/crm/leads)...");
  const crmLeadAdmin = await testRoute("CRM Leads Admin", getCrmLeads, "/api/crm/leads", adminSession);
  console.log(`  Admin status: ${crmLeadAdmin.status}, count: ${crmLeadAdmin.data?.leads?.length ?? 0}`);
  if (crmLeadAdmin.status !== 200) throw new Error(`CRM leads admin route failed: ${crmLeadAdmin.status}`);

  const crmLeadSales = await testRoute("CRM Leads Non-Admin", getCrmLeads, "/api/crm/leads", salesSession);
  console.log(`  Non-Admin status: ${crmLeadSales.status}, count: ${crmLeadSales.data?.leads?.length ?? 0}`);
  if (crmLeadSales.status !== 200) throw new Error(`CRM leads non-admin route failed: ${crmLeadSales.status}`);
  const nonAdminLeadsLeaked = (crmLeadSales.data?.leads || []).filter((l: any) => l.isDemo);
  if (nonAdminLeadsLeaked.length > 0) throw new Error(`SECURITY BREACH: Non-admin received demo leads!`);
  console.log("  ✓ CRM leads route returns 200 and enforces demo isolation.");

  // 4. CRM Opportunities
  console.log("\n[4] Testing CRM Opportunities Route (/api/crm/opportunities)...");
  const crmOppAdmin = await testRoute("CRM Opps Admin", getCrmOpps, "/api/crm/opportunities", adminSession);
  console.log(`  Admin status: ${crmOppAdmin.status}, count: ${crmOppAdmin.data?.opportunities?.length ?? 0}`);
  if (crmOppAdmin.status !== 200) throw new Error(`CRM opportunities admin route failed: ${crmOppAdmin.status}`);

  const crmOppSales = await testRoute("CRM Opps Non-Admin", getCrmOpps, "/api/crm/opportunities", salesSession);
  console.log(`  Non-Admin status: ${crmOppSales.status}, count: ${crmOppSales.data?.opportunities?.length ?? 0}`);
  if (crmOppSales.status !== 200) throw new Error(`CRM opportunities non-admin route failed: ${crmOppSales.status}`);
  const nonAdminOppsLeaked = (crmOppSales.data?.opportunities || []).filter((o: any) => o.isDemo);
  if (nonAdminOppsLeaked.length > 0) throw new Error(`SECURITY BREACH: Non-admin received demo opportunities!`);
  console.log("  ✓ CRM opportunities route returns 200 and enforces demo isolation.");

  // 5. CRM Activities
  console.log("\n[5] Testing CRM Activities Route (/api/crm/activities)...");
  const actAdmin = await testRoute("CRM Activities Admin", getCrmActivities, "/api/crm/activities", adminSession);
  console.log(`  Admin status: ${actAdmin.status}, count: ${actAdmin.data?.activities?.length ?? 0}`);
  if (actAdmin.status !== 200) throw new Error(`CRM activities admin route failed: ${actAdmin.status}`);

  const actSales = await testRoute("CRM Activities Non-Admin", getCrmActivities, "/api/crm/activities", salesSession);
  console.log(`  Non-Admin status: ${actSales.status}, count: ${actSales.data?.activities?.length ?? 0}`);
  if (actSales.status !== 200) throw new Error(`CRM activities non-admin route failed: ${actSales.status}`);
  console.log("  ✓ CRM activities route returns 200.");

  // 6. CRM Tasks
  console.log("\n[6] Testing CRM Tasks Route (/api/crm/tasks)...");
  const taskAdmin = await testRoute("CRM Tasks Admin", getCrmTasks, "/api/crm/tasks", adminSession);
  console.log(`  Admin status: ${taskAdmin.status}, count: ${taskAdmin.data?.tasks?.length ?? 0}`);
  if (taskAdmin.status !== 200) throw new Error(`CRM tasks admin route failed: ${taskAdmin.status}`);

  const taskSales = await testRoute("CRM Tasks Non-Admin", getCrmTasks, "/api/crm/tasks", salesSession);
  console.log(`  Non-Admin status: ${taskSales.status}, count: ${taskSales.data?.tasks?.length ?? 0}`);
  if (taskSales.status !== 200) throw new Error(`CRM tasks non-admin route failed: ${taskSales.status}`);
  console.log("  ✓ CRM tasks route returns 200.");

  // 7. Admin Dashboard
  console.log("\n[7] Testing Admin Dashboard Route (/api/admin/dashboard)...");
  const dashAdmin = await testRoute("Admin Dashboard", getAdminDashboard as any, "/api/admin/dashboard", adminSession);
  console.log(`  Admin status: ${dashAdmin.status}, profitAvailable: ${dashAdmin.data?.summary?.finance?.profitAvailable}`);
  if (dashAdmin.status !== 200) throw new Error(`Admin dashboard route failed: ${dashAdmin.status}`);
  if (!dashAdmin.data?.summary?.finance?.profitAvailable) {
    throw new Error("Admin dashboard profitAvailable is false!");
  }

  const dashSales = await testRoute("Admin Dashboard Non-Admin", getAdminDashboard as any, "/api/admin/dashboard", salesSession);
  console.log(`  Non-Admin status: ${dashSales.status} (Access Denied expected)`);
  if (dashSales.status !== 401 && dashSales.status !== 403) {
    throw new Error(`SECURITY BREACH: Non-admin was able to load Admin Dashboard! Status: ${dashSales.status}`);
  }
  console.log("  ✓ Admin dashboard route strictly rejects non-admin users with 401/403.");

  console.log("\n==========================================================");
  console.log(">>> ALL API ROUTE AUDITS PASSED WITH ZERO BREACHES! <<<");
  console.log("==========================================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("API Route Audit Error:", err);
  process.exit(1);
});
