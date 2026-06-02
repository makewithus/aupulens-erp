import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Manually load environment variables from .env
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  for (const line of envConfig.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Error: MONGODB_URI is not defined in your .env file.");
  process.exit(1);
}

// Import models
import Organization from "../models/Organization";
import User from "../models/User";
import Employee from "../models/Employee";
import Department from "../models/Department";
import Account from "../models/Account";
import Customer from "../models/Customer";
import Product from "../models/Product";
import Invoice from "../models/Invoice";
import JournalEntry from "../models/JournalEntry";
import PurchaseOrder from "../models/PurchaseOrder";
import StockMove from "../models/StockMove";
import Warehouse from "../models/Warehouse";
import { seedChartOfAccounts } from "../lib/accounting/coa-seeder";
import { ENTITY_STATUS, DOCUMENT_STATUS, PAYMENT_STATE, VOUCHER_STATUS } from "../lib/constants/statuses";

const COMPANYS = [
  { subdomain: "default-tenant", name: "Aupulens Corporate HQ" },
  { subdomain: "lumina-tech", name: "Lumina Tech Solutions" },
  { subdomain: "vertex-mfg", name: "Vertex Advanced Manufacturing" },
  { subdomain: "apex-logistics", name: "Apex Global Logistics" },
  { subdomain: "aurora-retail", name: "Aurora Lifestyle Retail" },
  { subdomain: "horizon-health", name: "Horizon Healthcare Biotech" },
];

const STAFF_TEMPLATE = [
  { first: "Alice", last: "Smith", role: "admin", dept: "Management", designation: "CEO / Managing Director", salary: 150000 },
  { first: "Bob", last: "Johnson", role: "finance", dept: "Finance", designation: "Chief Financial Officer", salary: 110000 },
  { first: "Charlie", last: "Brown", role: "finance", dept: "Finance", designation: "Senior Accountant", salary: 75000 },
  { first: "David", last: "Davis", role: "sales", dept: "Sales & Marketing", designation: "VP of Sales", salary: 95000 },
  { first: "Eva", last: "Miller", role: "sales", dept: "Sales & Marketing", designation: "Account Executive", salary: 60000 },
  { first: "Frank", last: "Wilson", role: "inventory", dept: "Operations & Logistics", designation: "Logistics Manager", salary: 80000 },
  { first: "Grace", last: "Moore", role: "inventory", dept: "Operations & Logistics", designation: "Warehouse Supervisor", salary: 50000 },
  { first: "Henry", last: "Taylor", role: "hr", dept: "Human Resources", designation: "HR Director", salary: 90000 },
  { first: "Ivy", last: "Thomas", role: "hr", dept: "Human Resources", designation: "HR Specialist", salary: 55000 },
  { first: "Jack", last: "Anderson", role: "sales", dept: "Sales & Marketing", designation: "Sales Representative", salary: 52000 },
  { first: "Karen", last: "Jackson", role: "inventory", dept: "Operations & Logistics", designation: "Inventory Coordinator", salary: 48000 },
  { first: "Leo", last: "White", role: "hr", dept: "Human Resources", designation: "Recruiter", salary: 50000 },
];

async function seed() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(MONGODB_URI!);
    console.log("Connected to MongoDB successfully.");

    const hashedPassword = await bcrypt.hash("password123", 12);

    for (const comp of COMPANYS) {
      const tenantId = comp.subdomain;
      console.log(`Seeding data for company: ${comp.name} (${tenantId})...`);

      // 1. Cleanup old records for this tenant subdomain
      await Organization.deleteMany({ subdomain: tenantId });
      await User.deleteMany({ tenantId });
      await Employee.deleteMany({ tenantId });
      await Department.deleteMany({ tenantId });
      await Account.deleteMany({ tenantId });
      await Customer.deleteMany({ tenantId });
      await Product.deleteMany({ tenantId });
      await Invoice.deleteMany({ tenantId });
      await JournalEntry.deleteMany({ tenantId });
      await PurchaseOrder.deleteMany({ tenantId });
      await StockMove.deleteMany({ tenantId });
      await Warehouse.deleteMany({ tenantId });

      // 2. Create standard departments
      const deptMap = new Map<string, mongoose.Types.ObjectId>();
      const deptNames = ["Management", "Finance", "Sales & Marketing", "Operations & Logistics", "Human Resources"];
      for (const dName of deptNames) {
        const dCode = dName.replace(/[^a-zA-Z]/g, "").substring(0, 4).toUpperCase();
        const dept = await Department.create({
          tenantId,
          name: dName,
          code: `${dCode}-${tenantId.substring(0, 3).toUpperCase()}`,
          description: `${dName} department for ${comp.name}`,
          isActive: true,
        });
        deptMap.set(dName, dept._id as mongoose.Types.ObjectId);
      }

      // 3. Create 12 users & employees
      let ownerUserId = new mongoose.Types.ObjectId();
      const employeeIds: mongoose.Types.ObjectId[] = [];

      for (let i = 0; i < STAFF_TEMPLATE.length; i++) {
        const staff = STAFF_TEMPLATE[i];
        const email = `${staff.first.toLowerCase()}.${staff.last.toLowerCase()}@${tenantId}.com`;
        const phone = `+155500${i}${comp.subdomain.length}`;

        const userId = i === 0 ? ownerUserId : new mongoose.Types.ObjectId();

        await User.create({
          _id: userId,
          name: `${staff.first} ${staff.last}`,
          email,
          phone,
          password: hashedPassword,
          role: staff.role,
          status: ENTITY_STATUS.ACTIVE,
          tenantId,
          dateOfJoining: new Date("2025-01-15"),
        });

        const empId = new mongoose.Types.ObjectId();
        employeeIds.push(empId);

        await Employee.create({
          _id: empId,
          tenantId,
          userId: userId,
          employeeCode: `${tenantId.substring(0, 3).toUpperCase()}-EMP-${String(i + 1).padStart(3, "0")}`,
          firstName: staff.first,
          lastName: staff.last,
          email,
          phone,
          dateOfBirth: new Date("1990-05-12"),
          gender: i % 2 === 0 ? "male" : "female",
          maritalStatus: "single",
          nationality: "US",
          departmentId: deptMap.get(staff.dept),
          designation: staff.designation,
          dateOfJoining: new Date("2025-01-15"),
          employmentType: "full-time",
          salary: {
            basic: staff.salary * 0.5,
            hra: staff.salary * 0.3,
            da: staff.salary * 0.1,
            specialAllowance: staff.salary * 0.1,
            grossSalary: staff.salary,
            deductions: {
              pf: staff.salary * 0.06,
              esi: staff.salary * 0.01,
              professionalTax: 200,
              tds: staff.salary * 0.1,
              otherDeductions: 0,
            },
            netSalary: staff.salary - (staff.salary * 0.17 + 200),
            currency: "USD",
          },
          leaveBalance: { casual: 12, sick: 6, earned: 15, unpaid: 0 },
          lifecycleStatus: "active",
          status: ENTITY_STATUS.ACTIVE,
        });
      }

      // 4. Create Organization
      await Organization.create({
        name: comp.name,
        subdomain: tenantId,
        ownerUserId: ownerUserId,
        isActive: true,
        trialEndDate: new Date("2026-12-31"),
        settings: {
          currency: "USD",
          themeColor: "#3b82f6",
        },
      });

      // 5. Seed Chart of Accounts
      await seedChartOfAccounts(tenantId, String(ownerUserId));

      // Get account maps
      const accounts = await Account.find({ tenantId });
      const getAccId = (code: string) => accounts.find(a => a.code === code)?._id;

      const accReceivable = getAccId("1200");
      const accCash = getAccId("1110");
      const accSales = getAccId("4100");
      const accPayable = getAccId("2100");
      const accCOGS = getAccId("5100");

      // 6. Create 3 Customers/Vendors
      const customers = [
        { name: "Apex Global Corp", email: "info@apex.com", is_company: true },
        { name: "Zenith Services LLC", email: "billing@zenith.com", is_company: true },
        { name: "Alpha Distributing", email: "orders@alpha.com", is_company: true },
      ];
      const customerDocs = [];
      for (const cust of customers) {
        const doc = await Customer.create({
          tenantId,
          header: { name: cust.name, is_company: cust.is_company },
          contact_details: { email: cust.email, phone: "+18005550199" },
          createdBy: ownerUserId,
          accounting_tab: {
            property_account_receivable_id: accReceivable,
            property_account_payable_id: accPayable,
          },
        });
        customerDocs.push(doc);
      }

      // 7. Create 3 Products
      const products = [
        { name: "Enterprise Cloud Subscription", price: 1200, cost: 300, code: "PRD-CLOUD" },
        { name: "Premium Advisory Consulting", price: 2500, cost: 500, code: "PRD-CONS" },
        { name: "Hardware Server Rack Unit", price: 8500, cost: 4500, code: "PRD-SRV" },
      ];
      const productDocs = [];
      for (const prod of products) {
        const doc = await Product.create({
          tenantId,
          header: { name: prod.name, sale_ok: true, purchase_ok: true },
          tab_general_information: {
            type: "consu",
            list_price: prod.price,
            standard_price: prod.cost,
            default_code: prod.code,
            invoice_policy: "order",
          },
          tab_accounting: {
            cost_and_revenue: {
              property_account_income_id: accSales,
              property_account_expense_id: accCOGS,
            },
          },
          status: DOCUMENT_STATUS.POSTED,
          createdBy: ownerUserId,
        });
        productDocs.push(doc);
      }

      // 8. Create a Warehouse
      const warehouse = await Warehouse.create({
        tenantId,
        warehouseCode: `WH-${tenantId.toUpperCase()}`,
        name: `Primary Warehouse - ${comp.name}`,
        location: "Central Hub",
        address: "100 Logistics Blvd, Industry Suite",
        capacity: 10000,
        currentUtilization: 450,
        type: "standard",
        manager: "Frank Wilson",
        status: ENTITY_STATUS.ACTIVE,
        createdBy: ownerUserId,
      });

      // 9. Seed 2 Invoices
      const invPaid = await Invoice.create({
        tenantId,
        name: `INV/2026/001-${tenantId.toUpperCase()}`,
        partnerId: customerDocs[0]._id,
        invoiceDate: new Date("2026-05-10"),
        dueDate: new Date("2026-06-10"),
        state: DOCUMENT_STATUS.POSTED,
        moveType: "out_invoice",
        invoiceLines: [
          {
            productId: productDocs[0]._id,
            name: productDocs[0].header.name,
            quantity: 10,
            priceUnit: productDocs[0].tab_general_information.list_price,
            priceSubtotal: 10 * productDocs[0].tab_general_information.list_price,
            accountId: accSales,
          },
        ],
        currencyId: "USD",
        receivableAccountId: accReceivable,
        amountUntaxed: 12000,
        amountTax: 0,
        amountTotal: 12000,
        amountResidual: 0,
        paymentState: PAYMENT_STATE.PAID,
        paidDate: new Date("2026-05-12"),
        createdBy: ownerUserId,
      });

      const invUnpaid = await Invoice.create({
        tenantId,
        name: `INV/2026/002-${tenantId.toUpperCase()}`,
        partnerId: customerDocs[1]._id,
        invoiceDate: new Date("2026-05-20"),
        dueDate: new Date("2026-06-20"),
        state: DOCUMENT_STATUS.POSTED,
        moveType: "out_invoice",
        invoiceLines: [
          {
            productId: productDocs[1]._id,
            name: productDocs[1].header.name,
            quantity: 5,
            priceUnit: productDocs[1].tab_general_information.list_price,
            priceSubtotal: 5 * productDocs[1].tab_general_information.list_price,
            accountId: accSales,
          },
        ],
        currencyId: "USD",
        receivableAccountId: accReceivable,
        amountUntaxed: 12500,
        amountTax: 0,
        amountTotal: 12500,
        amountResidual: 12500,
        paymentState: PAYMENT_STATE.NOT_PAID,
        createdBy: ownerUserId,
      });

      // 10. Seed 2 Vendor Bills
      const billPaid = await Invoice.create({
        tenantId,
        name: `BILL/2026/001-${tenantId.toUpperCase()}`,
        partnerId: customerDocs[2]._id,
        invoiceDate: new Date("2026-05-02"),
        dueDate: new Date("2026-06-02"),
        state: DOCUMENT_STATUS.POSTED,
        moveType: "in_invoice",
        invoiceLines: [
          {
            productId: productDocs[2]._id,
            name: productDocs[2].header.name,
            quantity: 2,
            priceUnit: productDocs[2].tab_general_information.standard_price,
            priceSubtotal: 2 * productDocs[2].tab_general_information.standard_price,
            accountId: accCOGS,
          },
        ],
        currencyId: "USD",
        payableAccountId: accPayable,
        amountUntaxed: 9000,
        amountTax: 0,
        amountTotal: 9000,
        amountResidual: 0,
        paymentState: PAYMENT_STATE.PAID,
        paidDate: new Date("2026-05-05"),
        createdBy: ownerUserId,
      });

      const billUnpaid = await Invoice.create({
        tenantId,
        name: `BILL/2026/002-${tenantId.toUpperCase()}`,
        partnerId: customerDocs[2]._id,
        invoiceDate: new Date("2026-05-15"),
        dueDate: new Date("2026-06-15"),
        state: DOCUMENT_STATUS.POSTED,
        moveType: "in_invoice",
        invoiceLines: [
          {
            productId: productDocs[2]._id,
            name: productDocs[2].header.name,
            quantity: 1,
            priceUnit: productDocs[2].tab_general_information.standard_price,
            priceSubtotal: productDocs[2].tab_general_information.standard_price,
            accountId: accCOGS,
          },
        ],
        currencyId: "USD",
        payableAccountId: accPayable,
        amountUntaxed: 4500,
        amountTax: 0,
        amountTotal: 4500,
        amountResidual: 4500,
        paymentState: PAYMENT_STATE.NOT_PAID,
        createdBy: ownerUserId,
      });

      // 11. Seed Journal Entries
      await JournalEntry.create({
        tenantId,
        header: {
          name: `JE/REV/001-${tenantId.toUpperCase()}`,
          date: new Date("2026-05-10"),
          ref: invPaid.name,
          journalType: "sale",
        },
        lineIds: [
          { accountId: accReceivable, debit: 12000, credit: 0, label: "Invoice 1 Receivable Entry" },
          { accountId: accSales, debit: 0, credit: 12000, label: "Invoice 1 Revenue Recognition" },
        ],
        totals: { currencyId: "USD", amountUntaxed: 12000, amountTax: 0, amountTotal: 12000 },
        status: DOCUMENT_STATUS.POSTED,
        voucherStatus: VOUCHER_STATUS.POSTED,
        createdBy: ownerUserId,
      });

      await JournalEntry.create({
        tenantId,
        header: {
          name: `JE/PMT/001-${tenantId.toUpperCase()}`,
          date: new Date("2026-05-12"),
          ref: `Payment for ${invPaid.name}`,
          journalType: "cash",
        },
        lineIds: [
          { accountId: accCash, debit: 12000, credit: 0, label: "Main Cash Receipt" },
          { accountId: accReceivable, debit: 0, credit: 12000, label: "Settle Customer Debt" },
        ],
        totals: { currencyId: "USD", amountUntaxed: 12000, amountTax: 0, amountTotal: 12000 },
        status: DOCUMENT_STATUS.POSTED,
        voucherStatus: VOUCHER_STATUS.POSTED,
        createdBy: ownerUserId,
      });

      await JournalEntry.create({
        tenantId,
        header: {
          name: `JE/REV/002-${tenantId.toUpperCase()}`,
          date: new Date("2026-05-20"),
          ref: invUnpaid.name,
          journalType: "sale",
        },
        lineIds: [
          { accountId: accReceivable, debit: 12500, credit: 0, label: "Invoice 2 Receivable Entry" },
          { accountId: accSales, debit: 0, credit: 12500, label: "Invoice 2 Revenue Recognition" },
        ],
        totals: { currencyId: "USD", amountUntaxed: 12500, amountTax: 0, amountTotal: 12500 },
        status: DOCUMENT_STATUS.POSTED,
        voucherStatus: VOUCHER_STATUS.POSTED,
        createdBy: ownerUserId,
      });

      await JournalEntry.create({
        tenantId,
        header: {
          name: `JE/EXP/001-${tenantId.toUpperCase()}`,
          date: new Date("2026-05-02"),
          ref: billPaid.name,
          journalType: "purchase",
        },
        lineIds: [
          { accountId: accCOGS, debit: 9000, credit: 0, label: "Purchase Expense" },
          { accountId: accPayable, debit: 0, credit: 9000, label: "Vendor Accounts Payable" },
        ],
        totals: { currencyId: "USD", amountUntaxed: 9000, amountTax: 0, amountTotal: 9000 },
        status: DOCUMENT_STATUS.POSTED,
        voucherStatus: VOUCHER_STATUS.POSTED,
        createdBy: ownerUserId,
      });

      await JournalEntry.create({
        tenantId,
        header: {
          name: `JE/PMT/002-${tenantId.toUpperCase()}`,
          date: new Date("2026-05-05"),
          ref: `Payment for ${billPaid.name}`,
          journalType: "cash",
        },
        lineIds: [
          { accountId: accPayable, debit: 9000, credit: 0, label: "Clear Vendor Payable" },
          { accountId: accCash, debit: 0, credit: 9000, label: "Main Cash Outflow" },
        ],
        totals: { currencyId: "USD", amountUntaxed: 9000, amountTax: 0, amountTotal: 9000 },
        status: DOCUMENT_STATUS.POSTED,
        voucherStatus: VOUCHER_STATUS.POSTED,
        createdBy: ownerUserId,
      });

      await JournalEntry.create({
        tenantId,
        header: {
          name: `JE/EXP/002-${tenantId.toUpperCase()}`,
          date: new Date("2026-05-15"),
          ref: billUnpaid.name,
          journalType: "purchase",
        },
        lineIds: [
          { accountId: accCOGS, debit: 4500, credit: 0, label: "Purchase Expense" },
          { accountId: accPayable, debit: 0, credit: 4500, label: "Vendor Accounts Payable" },
        ],
        totals: { currencyId: "USD", amountUntaxed: 4500, amountTax: 0, amountTotal: 4500 },
        status: DOCUMENT_STATUS.POSTED,
        voucherStatus: VOUCHER_STATUS.POSTED,
        createdBy: ownerUserId,
      });

      // 12. Seed Purchase Orders
      await PurchaseOrder.create({
        tenantId,
        name: `PO/2026/0001-${tenantId.toUpperCase()}`,
        partnerId: customerDocs[2]._id,
        dateOrder: new Date("2026-05-14"),
        orderLines: [
          {
            productId: productDocs[2]._id,
            name: productDocs[2].header.name,
            productQty: 5,
            receivedQty: 3,
            billedQty: 1,
            priceUnit: productDocs[2].tab_general_information.standard_price,
            priceSubtotal: 5 * productDocs[2].tab_general_information.standard_price,
            taxIds: [],
          },
        ],
        totals: {
          amountUntaxed: 5 * productDocs[2].tab_general_information.standard_price,
          amountTax: 0,
          amountTotal: 5 * productDocs[2].tab_general_information.standard_price,
        },
        status: DOCUMENT_STATUS.POSTED,
        createdBy: ownerUserId,
      });

      await PurchaseOrder.create({
        tenantId,
        name: `PO/2026/0002-${tenantId.toUpperCase()}`,
        partnerId: customerDocs[2]._id,
        dateOrder: new Date("2026-05-28"),
        orderLines: [
          {
            productId: productDocs[2]._id,
            name: productDocs[2].header.name,
            productQty: 2,
            receivedQty: 0,
            billedQty: 0,
            priceUnit: productDocs[2].tab_general_information.standard_price,
            priceSubtotal: 2 * productDocs[2].tab_general_information.standard_price,
            taxIds: [],
          },
        ],
        totals: {
          amountUntaxed: 2 * productDocs[2].tab_general_information.standard_price,
          amountTax: 0,
          amountTotal: 2 * productDocs[2].tab_general_information.standard_price,
        },
        status: DOCUMENT_STATUS.DRAFT,
        createdBy: ownerUserId,
      });

      // 13. Seed Stock Moves
      await StockMove.create({
        tenantId,
        reference: `SM-${tenantId.toUpperCase()}-001`,
        moveType: "incoming",
        destinationLocation: {
          warehouseId: warehouse._id as mongoose.Types.ObjectId,
          warehouseName: warehouse.name,
        },
        scheduledDate: new Date("2026-05-14"),
        lines: [
          {
            productId: productDocs[2]._id,
            productName: productDocs[2].header.name,
            demand: 5,
            done: 3,
            unitCost: productDocs[2].tab_general_information.standard_price,
            totalValue: 3 * productDocs[2].tab_general_information.standard_price,
          },
        ],
        moveStatus: "accounting_created",
        valuation: {
          method: "standard",
          totalValue: 3 * productDocs[2].tab_general_information.standard_price,
        },
        createdBy: ownerUserId,
      });
    }

    console.log("Database seeded successfully!");
    mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed with error:", err);
    process.exit(1);
  }
}

seed();
