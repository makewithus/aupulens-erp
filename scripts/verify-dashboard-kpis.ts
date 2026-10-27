import connectDB from "../lib/db";
import { buildPostedJournalReport, buildPostedIncomeExpenseSeries } from "../lib/accounting/reports";
import { SalesInvoice } from "../models/sales/SalesInvoice";
import SaleOrder from "../models/sales/SaleOrder";
import Product from "../models/inventory/Product";
import Customer from "../models/sales/Customer";
import ManufacturingOrder from "../models/manufacturing/ManufacturingOrder";
import StockMove from "../models/inventory/StockMove";
import Stock from "../models/inventory/Stock";
import Employee from "../models/hr/Employee";
import CrmLead from "../models/crm/Lead";
import CrmOpportunity from "../models/crm/Opportunity";

async function main() {
  await connectDB();
  const tenantId = "default-tenant";

  console.log("==================================================");
  console.log("VERIFYING LIVE ADMIN DASHBOARD KPIS & CALCULATIONS");
  console.log("==================================================");

  const [ledger, sixMonthSeries] = await Promise.all([
    buildPostedJournalReport({ tenantId }),
    buildPostedIncomeExpenseSeries({
      tenantId,
      startDate: new Date(Date.now() - 180 * 86400000),
      endDate: new Date(Date.now() + 30 * 86400000),
      groupBy: "month",
    }),
  ]);

  const totalRevenue = ledger.income.total;
  const totalExpenses = ledger.expense.total;
  const netIncome = ledger.statementSummary?.netIncome ?? (totalRevenue - totalExpenses);
  const postedEntries = ledger.activity.postedEntryCount;
  const isBalanced = ledger.totals.balanced;
  const hasExpenseActivity = Object.values(ledger.expense.accounts).some(
    (account: any) => account.debit !== 0 || account.credit !== 0,
  );
  const profitAvailable = postedEntries > 0 && hasExpenseActivity && isBalanced;

  console.log(`\n--- Financial Health ---`);
  console.log(`Posted Journal Entries : ${postedEntries}`);
  console.log(`Total Debits           : ₹${ledger.totals.debit.toLocaleString("en-IN")}`);
  console.log(`Total Credits          : ₹${ledger.totals.credit.toLocaleString("en-IN")}`);
  console.log(`Ledger Balanced        : ${isBalanced ? "YES (Debit == Credit)" : "NO (MISMATCH!)"}`);
  console.log(`Total Revenue          : ₹${totalRevenue.toLocaleString("en-IN")}`);
  console.log(`Total Expenses         : ₹${totalExpenses.toLocaleString("en-IN")}`);
  console.log(`Net Profit / Income    : ₹${netIncome.toLocaleString("en-IN")}`);
  console.log(`Profit Available Flag  : ${profitAvailable ? "TRUE (Live Profit Displayed)" : "FALSE"}`);
  console.log(`Monthly Series Points  : ${sixMonthSeries.length} months`);

  // Entity counts
  const [
    employeesCount,
    saleOrdersCount,
    customersCount,
    productsCount,
    manufacturingCount,
    stockMovesCount,
    stocksCount,
    crmLeadsCount,
    crmOppsCount,
  ] = await Promise.all([
    Employee.countDocuments({ tenantId }),
    SaleOrder.countDocuments({ tenantId }),
    Customer.countDocuments({ tenantId }),
    Product.countDocuments({ tenantId }),
    ManufacturingOrder.countDocuments({ tenantId }),
    StockMove.countDocuments({ tenantId }),
    Stock.countDocuments({ tenantId }),
    CrmLead.countDocuments({ tenantId }),
    CrmOpportunity.countDocuments({ tenantId }),
  ]);

  console.log(`\n--- Cross-Module Live Counts ---`);
  console.log(`HR Employees           : ${employeesCount}`);
  console.log(`Sales Orders           : ${saleOrdersCount}`);
  console.log(`Customers              : ${customersCount}`);
  console.log(`Inventory Products     : ${productsCount}`);
  console.log(`Stock Ledger Rows      : ${stocksCount}`);
  console.log(`Stock Movement Records : ${stockMovesCount}`);
  console.log(`Manufacturing Orders   : ${manufacturingCount}`);
  console.log(`CRM Leads              : ${crmLeadsCount}`);
  console.log(`CRM Opportunities      : ${crmOppsCount}`);

  if (!isBalanced) {
    throw new Error("Financial integrity failure: Ledger is not balanced!");
  }
  if (!profitAvailable) {
    throw new Error("Financial dashboard failure: profitAvailable is false!");
  }
  if (employeesCount !== 350) {
    throw new Error(`HR Employee Directory count mismatch: expected 350, found ${employeesCount}`);
  }

  console.log("\n>>> ALL DASHBOARD & KPI INTEGRITY CHECKS PASSED SUCCESSFULLY! <<<\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Dashboard Verification Failed:", err);
  process.exit(1);
});
