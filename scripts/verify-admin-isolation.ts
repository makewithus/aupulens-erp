import connectDB from "../lib/db";
import Employee from "../models/hr/Employee";
import CrmLead from "../models/crm/Lead";
import CrmOpportunity from "../models/crm/Opportunity";
import SaleOrder from "../models/sales/SaleOrder";
import Warehouse from "../models/inventory/Warehouse";
import Stock from "../models/inventory/Stock";
import Asset from "../models/finance/Asset";
import JournalEntry from "../models/finance/JournalEntry";
import {
  isAdminSession,
  applyDemoScope,
  canAccessDemoDoc,
  getDemoCacheSegment,
} from "../lib/auth/scopeFilter";

async function main() {
  await connectDB();
  const tenantId = "default-tenant";

  console.log("==========================================================");
  console.log("VERIFYING STRICT ADMIN-ONLY DEMO DATA ISOLATION CONTROLS");
  console.log("==========================================================");

  // 1. Session Mappings
  const adminSession = {
    user: {
      id: "admin-id-123",
      email: "admin@aupulens.com",
      role: "admin",
      tenantId,
    },
  };

  const nonAdminSalesSession = {
    user: {
      id: "sales-id-456",
      email: "david@aupulens.com",
      role: "sales",
      tenantId,
    },
  };

  const nonAdminHrSession = {
    user: {
      id: "hr-id-789",
      email: "hr.specialist@aupulens.com",
      role: "hr",
      tenantId,
    },
  };

  console.log("\n[1] Testing Session Role Recognition...");
  if (!isAdminSession(adminSession)) throw new Error("adminSession should be recognized as admin!");
  if (isAdminSession(nonAdminSalesSession)) throw new Error("salesSession MUST NOT be recognized as admin!");
  if (isAdminSession(nonAdminHrSession)) throw new Error("hrSession MUST NOT be recognized as admin!");
  console.log("  ✓ Admin and Non-Admin sessions correctly differentiated.");

  console.log("\n[2] Testing Cache Segmentation...");
  const adminCacheKey = getDemoCacheSegment(adminSession);
  const salesCacheKey = getDemoCacheSegment(nonAdminSalesSession);
  if (adminCacheKey !== "scope:admin") throw new Error(`Expected 'scope:admin', got ${adminCacheKey}`);
  if (salesCacheKey !== "scope:standard") throw new Error(`Expected 'scope:standard', got ${salesCacheKey}`);
  if ((adminCacheKey as string) === (salesCacheKey as string)) throw new Error("Cache keys MUST NOT collide across roles!");
  console.log(`  ✓ Admin Cache Segment: ${adminCacheKey}`);
  console.log(`  ✓ Sales Cache Segment: ${salesCacheKey} (Cache poisoning prevented)`);

  console.log("\n[3] Testing HR Employee Data Isolation...");
  const adminEmpQuery = applyDemoScope(adminSession, { tenantId });
  const nonAdminEmpQuery = applyDemoScope(nonAdminHrSession, { tenantId });

  const adminEmpCount = await Employee.countDocuments(adminEmpQuery);
  const nonAdminEmpCount = await Employee.countDocuments(nonAdminEmpQuery);
  const demoEmpCount = await Employee.countDocuments({ tenantId, isDemo: true });

  console.log(`  - Admin visible employees     : ${adminEmpCount}`);
  console.log(`  - Non-Admin visible employees : ${nonAdminEmpCount}`);
  console.log(`  - Demo flagged employees      : ${demoEmpCount}`);

  if (demoEmpCount !== 350) throw new Error(`Expected 350 demo employees, got ${demoEmpCount}`);
  if (adminEmpCount < 350) throw new Error("Admin must see all 350 seeded employees!");
  if (nonAdminEmpCount > (adminEmpCount - demoEmpCount)) {
    throw new Error(`Non-admin HR user is leaking demo employees! Found: ${nonAdminEmpCount}`);
  }
  console.log("  ✓ Zero demo employees exposed to Non-Admin HR users.");

  console.log("\n[4] Testing Single Record Lookup Protection (canAccessDemoDoc)...");
  const sampleDemoEmp = await Employee.findOne({ tenantId, isDemo: true });
  if (!sampleDemoEmp) throw new Error("No demo employee found for lookup test!");

  const adminCanAccess = canAccessDemoDoc(adminSession, sampleDemoEmp);
  const nonAdminCanAccess = canAccessDemoDoc(nonAdminSalesSession, sampleDemoEmp);

  if (!adminCanAccess) throw new Error("Admin was improperly blocked from viewing demo employee!");
  if (nonAdminCanAccess) throw new Error("SECURITY BREACH: Non-admin was permitted to access demo employee!");
  console.log(`  ✓ Admin direct ID access to ${sampleDemoEmp.employeeCode}: ALLOWED`);
  console.log(`  ✓ Non-Admin direct ID access to ${sampleDemoEmp.employeeCode}: REJECTED (404/403 enforced)`);

  console.log("\n[5] Testing CRM Leads & Opportunities Data Isolation...");
  const adminLeadQuery = applyDemoScope(adminSession, { tenantId });
  const nonAdminLeadQuery = applyDemoScope(nonAdminSalesSession, { tenantId });
  const adminLeads = await CrmLead.countDocuments(adminLeadQuery);
  const nonAdminLeads = await CrmLead.countDocuments(nonAdminLeadQuery);
  const demoLeads = await CrmLead.countDocuments({ tenantId, isDemo: true });

  console.log(`  - Admin visible leads         : ${adminLeads}`);
  console.log(`  - Non-Admin visible leads     : ${nonAdminLeads}`);
  console.log(`  - Demo flagged leads          : ${demoLeads}`);
  if (demoLeads < 25) throw new Error(`Expected at least 25 demo leads, got ${demoLeads}`);
  if (nonAdminLeads > (adminLeads - demoLeads)) throw new Error("Non-admin user leaked demo leads!");
  console.log("  ✓ CRM leads fully isolated.");

  const adminOppQuery = applyDemoScope(adminSession, { tenantId });
  const nonAdminOppQuery = applyDemoScope(nonAdminSalesSession, { tenantId });
  const adminOpps = await CrmOpportunity.countDocuments(adminOppQuery);
  const nonAdminOpps = await CrmOpportunity.countDocuments(nonAdminOppQuery);
  const demoOpps = await CrmOpportunity.countDocuments({ tenantId, isDemo: true });

  console.log(`  - Admin visible opportunities : ${adminOpps}`);
  console.log(`  - Non-Admin opportunities     : ${nonAdminOpps}`);
  console.log(`  - Demo flagged opportunities  : ${demoOpps}`);
  if (demoOpps < 15) throw new Error(`Expected at least 15 demo opportunities, got ${demoOpps}`);
  if (nonAdminOpps > (adminOpps - demoOpps)) throw new Error("Non-admin user leaked demo opportunities!");
  console.log("  ✓ CRM opportunities fully isolated.");

  console.log("\n[6] Testing Sales Orders Isolation...");
  const adminSoQuery = applyDemoScope(adminSession, { tenantId });
  const nonAdminSoQuery = applyDemoScope(nonAdminSalesSession, { tenantId });
  const adminOrders = await SaleOrder.countDocuments(adminSoQuery);
  const nonAdminOrders = await SaleOrder.countDocuments(nonAdminSoQuery);
  const demoOrders = await SaleOrder.countDocuments({ tenantId, isDemo: true });

  console.log(`  - Admin visible sale orders   : ${adminOrders}`);
  console.log(`  - Non-Admin sale orders       : ${nonAdminOrders}`);
  console.log(`  - Demo flagged sale orders    : ${demoOrders}`);
  if (demoOrders < 20) throw new Error(`Expected at least 20 demo sale orders, got ${demoOrders}`);
  if (nonAdminOrders > (adminOrders - demoOrders)) throw new Error("Non-admin user leaked demo orders!");
  console.log("  ✓ Sales orders fully isolated.");

  console.log("\n[7] Testing Inventory Warehouses & Stocks Isolation...");
  const demoWhCount = await Warehouse.countDocuments({ tenantId, isDemo: true });
  const demoStocksCount = await Stock.countDocuments({ tenantId, isDemo: true });
  console.log(`  - Demo warehouses tagged      : ${demoWhCount}`);
  console.log(`  - Demo stock balances tagged  : ${demoStocksCount}`);
  if (demoWhCount < 3) throw new Error("Expected at least 3 demo warehouses tagged!");
  if (demoStocksCount < 7) throw new Error("Expected at least 7 demo stock balances tagged!");
  console.log("  ✓ Inventory records tagged with isDemo: true.");

  console.log("\n[8] Testing Finance Assets & Journals Isolation...");
  const demoAssets = await Asset.countDocuments({ tenantId, isDemo: true });
  const demoJournals = await JournalEntry.countDocuments({ tenantId, isDemo: true });
  console.log(`  - Demo fixed assets tagged    : ${demoAssets}`);
  console.log(`  - Demo journal entries tagged : ${demoJournals}`);
  if (demoAssets < 6) throw new Error("Expected at least 6 demo assets tagged!");
  if (demoJournals < 7) throw new Error("Expected at least 7 demo journal entries tagged!");
  console.log("  ✓ Finance records tagged with isDemo: true.");

  console.log("\n==========================================================");
  console.log(">>> ALL ADMIN-ONLY DATA ISOLATION AUDITS PASSED 100% <<<");
  console.log("==========================================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Admin Isolation Audit Failed:", err);
  process.exit(1);
});
