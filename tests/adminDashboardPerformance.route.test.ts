import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/aupulens_test_admin_dashboard_perf";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { DOCUMENT_STATUS, ENTITY_STATUS, PAYMENT_STATE, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Invoice from "@/models/finance/Invoice";
import SaleOrder from "@/models/sales/SaleOrder";
import Product from "@/models/inventory/Product";
import Customer from "@/models/sales/Customer";
import StockTransfer from "@/models/inventory/StockTransfer";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import User from "@/models/auth/User";
import Expense from "@/models/finance/Expense";
import Transaction from "@/models/finance/Transaction";

const tenantId = "tenant-dashboard-perf";
const otherTenantId = "tenant-dashboard-other";
const userId = new mongoose.Types.ObjectId();
const customerId = new mongoose.Types.ObjectId();
const productId = new mongoose.Types.ObjectId();

function monthDate(offset: number, day = 10) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, day, 12, 0, 0, 0);
}

async function seedDashboardData() {
  await Customer.create({
    _id: customerId,
    tenantId,
    header: { name: "Dashboard Customer" },
    createdBy: userId,
  });

  await Product.create({
    _id: productId,
    tenantId,
    header: { name: "Dashboard Product" },
    tab_general_information: { type: "consu" },
    status: "published",
    createdBy: userId,
  });

  await SalesInvoice.create([
    {
      tenantId,
      number: "INV-CURRENT",
      customerId,
      invoiceDate: monthDate(0),
      dueDate: monthDate(0, 20),
      lineItems: [{ name: "Item", qty: 1, unitPrice: 100, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 100 }],
      taxableAmount: 100,
      totalAmount: 100,
      status: SALES_INVOICE_STATUS.SAVED,
    },
    {
      tenantId,
      number: "INV-PREVIOUS",
      customerId,
      invoiceDate: monthDate(-1),
      dueDate: monthDate(-1, 20),
      lineItems: [{ name: "Item", qty: 1, unitPrice: 50, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 50 }],
      taxableAmount: 50,
      totalAmount: 50,
      status: SALES_INVOICE_STATUS.PAID,
    },
    {
      tenantId,
      number: "INV-DRAFT",
      customerId,
      invoiceDate: monthDate(0),
      dueDate: monthDate(0, 20),
      lineItems: [{ name: "Item", qty: 1, unitPrice: 25, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 25 }],
      taxableAmount: 25,
      totalAmount: 25,
      status: SALES_INVOICE_STATUS.DRAFT,
    },
    {
      tenantId: otherTenantId,
      number: "INV-OTHER",
      customerId,
      invoiceDate: monthDate(0),
      dueDate: monthDate(0, 20),
      lineItems: [{ name: "Item", qty: 1, unitPrice: 9999, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 9999 }],
      taxableAmount: 9999,
      totalAmount: 9999,
      status: SALES_INVOICE_STATUS.SAVED,
    },
  ]);

  await Invoice.create([
    {
      tenantId,
      name: "BILL-POSTED",
      partnerId: customerId,
      moveType: "in_invoice",
      invoiceDate: monthDate(0),
      invoiceLines: [{ name: "Bill", quantity: 1, priceUnit: 20, priceSubtotal: 20 }],
      state: DOCUMENT_STATUS.POSTED,
      paymentState: PAYMENT_STATE.NOT_PAID,
      amountUntaxed: 20,
      amountTax: 0,
      amountTotal: 20,
    },
    {
      tenantId,
      name: "BILL-PAID",
      partnerId: customerId,
      moveType: "in_invoice",
      invoiceDate: monthDate(0),
      invoiceLines: [{ name: "Bill", quantity: 1, priceUnit: 30, priceSubtotal: 30 }],
      state: DOCUMENT_STATUS.DRAFT,
      paymentState: PAYMENT_STATE.PAID,
      amountUntaxed: 30,
      amountTax: 0,
      amountTotal: 30,
    },
    {
      tenantId,
      name: "BILL-DRAFT",
      partnerId: customerId,
      moveType: "in_invoice",
      invoiceDate: monthDate(0),
      invoiceLines: [{ name: "Bill", quantity: 1, priceUnit: 500, priceSubtotal: 500 }],
      state: DOCUMENT_STATUS.DRAFT,
      paymentState: PAYMENT_STATE.NOT_PAID,
      amountUntaxed: 500,
      amountTax: 0,
      amountTotal: 500,
    },
  ]);

  await SaleOrder.create({
    tenantId,
    header: { name: "SO-DASH", partnerId: customerId, dateOrder: monthDate(0) },
    orderLines: [{ name: "Item", productQty: 1, priceUnit: 100, priceSubtotal: 100 }],
    totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
    createdAt: monthDate(0),
  });

  await StockTransfer.create({
    tenantId,
    header: { name: "ST-DASH", operationType: "outgoing" },
    operations_tab: [{ productId, demand: 1 }],
  });

  await ManufacturingOrder.create({
    tenantId,
    header: { name: "MO-DASH", productId, quantity: 1 },
  });

  await User.create([
    {
      tenantId,
      name: "Active User",
      email: "active.dashboard@example.com",
      phone: "1111111111",
      password: "secret1",
      role: "admin",
      status: ENTITY_STATUS.ACTIVE,
    },
    {
      tenantId,
      name: "Inactive User",
      email: "inactive.dashboard@example.com",
      phone: "2222222222",
      password: "secret2",
      role: "sales",
      status: ENTITY_STATUS.INACTIVE,
    },
  ]);

  await Expense.create({
    tenantId,
    description: "Travel",
    category: "Travel",
    total: 70,
    employeeId: userId,
    accountId: new mongoose.Types.ObjectId(),
  });

  await Transaction.create({
    tenantId,
    date: monthDate(0),
    account: "Sales",
    accountCategory: "revenue",
    type: "credit",
    amount: 100,
    baseAmount: 100,
    createdBy: userId,
  });
}

describe("Admin dashboard summary performance route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      SalesInvoice,
      Invoice,
      SaleOrder,
      Product,
      Customer,
      StockTransfer,
      ManufacturingOrder,
      User,
      Expense,
      Transaction,
    ].map((model: any) => model.init()));
  });

  afterEach(async () => {
    await Promise.all([
      SalesInvoice,
      Invoice,
      SaleOrder,
      Product,
      Customer,
      StockTransfer,
      ManufacturingOrder,
      User,
      Expense,
      Transaction,
    ].map((model: any) => model.deleteMany({})));
    vi.mocked(auth).mockReset();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    (globalThis as any).mongoose = { conn: null, promise: null };
  });

  it("uses aggregate-backed tenant summaries without loading whole invoice collections", async () => {
    await seedDashboardData();
    vi.mocked(auth).mockResolvedValue({ user: { id: String(userId), tenantId, role: "admin" } } as any);

    const salesFindSpy = vi.spyOn(SalesInvoice as any, "find");
    const purchaseFindSpy = vi.spyOn(Invoice as any, "find");
    const { GET } = await import("@/app/api/admin/dashboard/route");

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(salesFindSpy).not.toHaveBeenCalled();
    expect(purchaseFindSpy).not.toHaveBeenCalled();
    expect(body.summary.finance.totalRevenue).toBe(150);
    expect(body.summary.finance.revenueCurrentMonth).toBe(100);
    expect(body.summary.finance.totalExpenses).toBe(50);
    expect(body.summary.finance.expensesCurrentMonth).toBe(50);
    expect(body.summary.finance.draftInvoices).toBe(1);
    expect(body.summary.finance.totalExpenseRecords).toBe(70);
    expect(body.summary.inventory.publishedProducts).toBe(1);
    expect(body.summary.sales.totalOrders).toBe(1);
    expect(body.summary.users.totalUsers).toBe(2);
    expect(body.summary.users.activeUsers).toBe(1);
  });
});
