/**
 * AUPULENS ERP — Comprehensive Master Data Seeder
 *
 * Seeds rich, production-grade, relationally linked data across:
 * 1. SALES: Customers, Quotations, Sale Orders, Delivery Challans, Payments, Subscriptions, Pricelists, Payment Modes, Delivery Methods, Document Settings
 * 2. FINANCE: Chart of Accounts, Bank Accounts, Vendors, Vendor Bills (Invoices), Purchase Orders, Expenses, Fixed Assets, Balanced Journal Entries, Bank Statements, Budgets, Banking Rules, Period Closings, Tax Rates
 * 3. MANUFACTURING: Items, Item BOMs, Bill of Materials, Manufacturing Orders, Shipments, Air Freight, Customs Clearances, Freight Providers, HS Codes, Coupons
 * 4. CRM: Accounts, Contacts, Leads, Opportunities, Activities, Tasks, Support Cases, Quotes, Contracts, Campaigns, Field Visits, Communications, Onboarding Plans, Notifications, Automation Rules, Saved Views
 *
 * AND fully enables ALL modules for `admin@aupulens.com` on the Enterprise plan.
 *
 * Idempotent: Every entity is keyed deterministically and uses upsert semantics.
 * Existing real data (e.g. 341 SalesInvoices) is strictly preserved.
 */

import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const TENANT_ID = "default-tenant";
const SEED_SOURCE = "master_full_seed_v1";

const ALL_MODULES = [
  "admin",
  "sales",
  "inventory",
  "finance",
  "manufacturing",
  "hr",
  "crm",
  "project",
  "projects",
];

// Helper for encryption matching lib/crypto.ts
function encrypt(plaintext: string): string {
  const rawKey = process.env.ENCRYPTION_KEY || "LBPL+S63tqa4g2q3MatlTGL1jf3v1WhIaOX9A+pMiyk=";
  const key = Buffer.from(rawKey, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

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
    console.log(`=======================================================`);
    console.log(`Connected to database: ${db.databaseName}`);
    console.log(`Target Tenant Scope: ${TENANT_ID}`);
    console.log(`Seeding all modules: Sales, Finance, Manufacturing, CRM`);
    console.log(`=======================================================\n`);

    // ─────────────────────────────────────────────────────────────
    // 0. ADMIN USER & ALL MODULES ACTIVATION
    // ─────────────────────────────────────────────────────────────
    console.log("==> Step 0: Enabling ALL modules for admin@aupulens.com and default-tenant...");

    const adminPasswordHash = await bcrypt.hash("Aupulens@2026", 10);
    const encSecret = encrypt("JBSWY3DPEHPK3PXP");

    // 0.1 Update or insert admin in `users` collection
    const adminUserRes = await db.collection("users").findOneAndUpdate(
      { email: "admin@aupulens.com", tenantId: TENANT_ID },
      {
        $set: {
          name: "Aupulens Admin",
          email: "admin@aupulens.com",
          role: "admin",
          status: "active",
          tenantId: TENANT_ID,
          phone: "+919999999999",
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId("6a215dc202e80e4219f412c0"),
          password: adminPasswordHash,
          permissions: [],
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    const adminUserId = adminUserRes?._id || new ObjectId("6a215dc202e80e4219f412c0");
    console.log(`Admin User verified in 'users': ${adminUserId}`);

    // 0.2 Update or insert in `adminusers` collection for platform super-admin access
    await db.collection("adminusers").updateOne(
      { email: "admin@aupulens.com" },
      {
        $set: {
          name: "Aupulens Global Super Admin",
          email: "admin@aupulens.com",
          role: "global_super_admin",
          status: "active",
          mfaEnabled: true,
          mfaSecretEncrypted: encSecret,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId(),
          passwordHash: adminPasswordHash,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    console.log("Admin Super-User verified in 'adminusers'.");

    // 0.3 Enable ALL modules on Organization for default-tenant
    await db.collection("organizations").updateOne(
      { subdomain: TENANT_ID },
      {
        $set: {
          name: "Aupulens Technologies",
          subdomain: TENANT_ID,
          ownerUserId: adminUserId,
          tier: "enterprise",
          status: "active",
          isActive: true,
          subscriptionStatus: "active",
          maxUsers: 500,
          aiCallsPerMonth: 50000,
          "settings.themeColor": "#3b82f6",
          "settings.timezone": "Asia/Kolkata",
          "settings.currency": "INR",
          "settings.country": "India",
          "settings.state": "Maharashtra",
          "settings.city": "Mumbai",
          "settings.pincode": "400051",
          "settings.isGstRegistered": true,
          "settings.gstin": "27AAAAA0000A1Z5",
          "settings.enabledModules": ALL_MODULES,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    console.log("Organization 'default-tenant' upgraded to Enterprise with ALL modules enabled.");

    // 0.4 Enable ALL modules on OrganizationEntitlement for default-tenant
    await db.collection("organizationentitlements").updateOne(
      { tenantId: TENANT_ID },
      {
        $set: {
          tenantId: TENANT_ID,
          planKey: "enterprise",
          status: "active",
          modules: ALL_MODULES,
          "overrides.modules": ALL_MODULES,
          effectiveFrom: new Date("2026-01-01"),
          paidAccessEndsAt: new Date("2035-12-31"), // Long-term active entitlement
          assignedByActorRole: "global_super_admin",
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId(),
          assignedAt: new Date(),
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    console.log("OrganizationEntitlement set to Enterprise with all modules override.");

    // Ensure demo sales user David Davis
    const salesPasswordHash = await bcrypt.hash("Aupulens@2026", 10);
    const salesUserRes = await db.collection("users").findOneAndUpdate(
      { email: "david@aupulens.com" },
      {
        $set: {
          name: "David Davis",
          email: "david@aupulens.com",
          role: "sales",
          status: "active",
          tenantId: TENANT_ID,
          phone: "+919876543210",
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId("6a1f1d9f90da1d224b7a84fc"),
          password: salesPasswordHash,
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    const salesUserId = salesUserRes?._id || new ObjectId("6a1f1d9f90da1d224b7a84fc");

    // ─────────────────────────────────────────────────────────────
    // 1. SALES MODULE SEEDING
    // ─────────────────────────────────────────────────────────────
    console.log("\n==> Step 1: Seeding Sales Module (Customers, Quotes, Orders, Challans, Payments, Subscriptions, Pricelists)...");

    // 1.1 Customers
    const customerDefs = [
      { name: "Tata Steel Logistics Ltd", city: "Jamshedpur", state: "Jharkhand", gstin: "20AABCT1234F1Z1", email: "procurement@tatasteel.demo", phone: "+919830111101", address: "Tata Steel Complex, Bistupur" },
      { name: "Reliance Jio Infocomm", city: "Navi Mumbai", state: "Maharashtra", gstin: "27AABCR9876K1Z9", email: "telecom.ops@jio.demo", phone: "+919830111102", address: "Reliance Corporate Park, Ghansoli" },
      { name: "Infosys BPM Tech Services", city: "Bengaluru", state: "Karnataka", gstin: "29AABCI5432M1Z5", email: "finance@infosys.demo", phone: "+919830111103", address: "Electronics City Phase 1" },
      { name: "Larsen & Toubro Heavy Inf", city: "Mumbai", state: "Maharashtra", gstin: "27AABCL1111P1Z2", email: "supplies@lntecc.demo", phone: "+919830111104", address: "L&T House, Ballard Estate" },
      { name: "Bajaj Auto Distribution", city: "Pune", state: "Maharashtra", gstin: "27AABCB2222Q1Z3", email: "dealers@bajajauto.demo", phone: "+919830111105", address: "Akurdi Industrial Estate" },
      { name: "Mahindra Logistics Hub", city: "Pune", state: "Maharashtra", gstin: "27AABCM3333R1Z4", email: "hub.ops@mahindralogistics.demo", phone: "+919830111106", address: "Chakan Industrial Zone Phase 2" },
      { name: "Sundar Textiles Pvt Ltd", city: "Coimbatore", state: "Tamil Nadu", gstin: "33AABCS1234F1Z8", email: "accounts@sundartextiles.demo", phone: "+919830111107", address: "144 Avinashi Road" },
      { name: "Om Sai Traders", city: "Surat", state: "Gujarat", gstin: "24AABCO4444T1Z5", email: "trading@omsaitraders.demo", phone: "+919830111108", address: "Ring Road Textile Market" },
      { name: "Kaveri Subscriptions Pvt Ltd", city: "Mysuru", state: "Karnataka", gstin: "29AACCK4321L1ZR", email: "contact@kaverisub.demo", phone: "+919830111109", address: "Hebbal Industrial Area" },
      { name: "Greenfield Agro Exports", city: "Ludhiana", state: "Punjab", gstin: "03AAECG5678K1ZQ", email: "exports@greenfieldagro.demo", phone: "+919830111110", address: "Focal Point Phase 5" },
      { name: "Apollo Meditech Labs", city: "Hyderabad", state: "Telangana", gstin: "36AABCA7777N1Z6", email: "meditech@apollo.demo", phone: "+919830111111", address: "Jubilee Hills Road 36" },
      { name: "Bharat Forge Engineering", city: "Pune", state: "Maharashtra", gstin: "27AABCB8888P1Z8", email: "forge.procurement@bharatforge.demo", phone: "+919830111112", address: "Mundhwa Industrial Area" },
    ];

    const customerIds: ObjectId[] = [];
    for (const c of customerDefs) {
      let cust = await db.collection("customers").findOne({ tenantId: TENANT_ID, "header.name": c.name });
      if (!cust) {
        const res = await db.collection("customers").insertOne({
          tenantId: TENANT_ID,
          header: { name: c.name, is_company: true, customerType: "business" },
          contact_details: { email: c.email, phone: c.phone },
          address_tab: { street: c.address, city: c.city, state_name: c.state, pincode: "400001" },
          shipping_address: { street: c.address, city: c.city, state_name: c.state, pincode: "400001" },
          gstin: c.gstin,
          currency: "INR",
          openingBalance: 0,
          isDemo: true,
          source: SEED_SOURCE,
          createdBy: adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        customerIds.push(res.insertedId);
      } else {
        customerIds.push(cust._id);
      }
    }
    console.log(`Customers verified: ${customerIds.length}`);

    // Products check
    const products = await db.collection("products").find({ tenantId: TENANT_ID }).toArray();
    console.log(`Inventory products loaded: ${products.length}`);
    const prodMap: Record<string, any> = {};
    products.forEach((p) => {
      const code = p.tab_general_information?.default_code || p.default_code || p.name;
      prodMap[code] = p;
    });

    // 1.2 Sales Quotations
    const quoteStatuses = ["draft", "sent", "accepted", "rejected", "invoiced"];
    for (let q = 1; q <= 15; q++) {
      const qNum = `QT-2026-${String(q).padStart(4, "0")}`;
      const custId = customerIds[q % customerIds.length];
      const p = products[q % products.length] || products[0];
      const unitPrice = p?.tab_general_information?.list_price || 15000;
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
                itemId: p?._id,
                name: p?.header?.name || p?.name || "Industrial Component Assembly",
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
            source: SEED_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (q * 3) * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Sales quotations verified: 15 quotes.");

    // 1.3 Sales Orders
    const orderStatuses = ["draft", "confirmed", "closed", "void"];
    const shipmentStatuses = ["not_shipped", "partially_shipped", "fulfilled"];
    const invoicingStatuses = ["not_invoiced", "partially_invoiced", "invoiced"];

    for (let so = 1; so <= 20; so++) {
      const soNum = `SO-2026-${String(so).padStart(4, "0")}`;
      const custId = customerIds[so % customerIds.length];
      const p = products[so % products.length] || products[0];
      const priceUnit = p?.tab_general_information?.list_price || 20000;
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
                productId: p?._id,
                name: p?.header?.name || p?.name || "Industrial Solution Package",
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
            otherInfo: { salespersonId: salesUserId },
            isDemo: true,
            source: SEED_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (so * 2) * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Sale orders verified: 20 orders.");

    // 1.4 Delivery Challans
    const dcStatuses: Array<"pending" | "issued" | "delivered"> = ["delivered", "issued", "pending"];
    for (let dc = 1; dc <= 10; dc++) {
      const dcNum = `DC-2026-${String(dc).padStart(4, "0")}`;
      const c = customerDefs[dc % customerDefs.length];
      const p = products[dc % products.length] || products[0];
      await db.collection("deliverychallans").updateOne(
        { tenantId: TENANT_ID, dcNumber: dcNum },
        {
          $set: {
            tenantId: TENANT_ID,
            dcNumber: dcNum,
            customer: c.name,
            customerEmail: c.email,
            items: [
              {
                productId: p?._id,
                description: p?.name || "Industrial Component Assembly",
                quantity: (dc * 2) + 5,
                unit: "Units",
              },
            ],
            deliveryAddress: `${c.address}, ${c.city}, ${c.state}`,
            vehicleNumber: `MH-${12 + (dc % 10)}-AB-${1000 + dc}`,
            driverName: dc % 2 === 0 ? "Ramesh Patil" : "Sanjay Deshmukh",
            deliveryDate: new Date(Date.now() - dc * 86400000).toISOString().split("T")[0],
            status: dcStatuses[dc % dcStatuses.length],
            notes: "Goods inspected and dispatched in tamper-evident packaging.",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - dc * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Delivery challans verified: 10 challans.");

    // 1.5 Customer Payments
    const payModes = ["NEFT/RTGS", "UPI Corporate", "Net Banking", "Cheque", "Credit Card"];
    for (let pm = 1; pm <= 15; pm++) {
      const pNum = `PAY-2026-${String(pm).padStart(4, "0")}`;
      const custId = customerIds[pm % customerIds.length];
      const amt = 25000 + pm * 15000;
      await db.collection("payments").updateOne(
        { tenantId: TENANT_ID, paymentNumber: pNum },
        {
          $set: {
            tenantId: TENANT_ID,
            customerId: custId,
            paymentNumber: pNum,
            paymentDate: new Date(Date.now() - pm * 86400000),
            amountReceived: amt,
            bankCharges: pm % 3 === 0 ? 150 : 0,
            mode: payModes[pm % payModes.length],
            reference: `BANK-REF-${800000 + pm}`,
            taxDeducted: pm % 4 === 0,
            tdsAmount: pm % 4 === 0 ? Math.round(amt * 0.02) : 0,
            allocations: [],
            unusedAmount: 0,
            status: "posted",
            paymentType: "regular",
            notes: "Electronic settlement received via automated gateway.",
            journalEntryIds: [],
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - pm * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Customer payments verified: 15 payments.");

    // 1.6 Recurring Subscriptions
    const subDefs = [
      { num: "SUB-DEMO-001", name: "Tata Steel - Monthly Enterprise ERP AMC", cust: 0, amt: 85000, status: "active" },
      { num: "SUB-DEMO-002", name: "Reliance Jio - Cloud Telemetry SLA", cust: 1, amt: 120000, status: "active" },
      { num: "SUB-DEMO-003", name: "Infosys BPM - Security Monitoring", cust: 2, amt: 65000, status: "active" },
      { num: "SUB-DEMO-004", name: "L&T Heavy - IoT Sensor Telemetry", cust: 3, amt: 95000, status: "trial" },
      { num: "SUB-DEMO-005", name: "Bajaj Auto - Multi-Site Dispatch License", cust: 4, amt: 45000, status: "active" },
      { num: "SUB-DEMO-006", name: "Kaveri Subscriptions - Quarterly AMC", cust: 8, amt: 36000, status: "past_due" },
      { num: "SUB-DEMO-007", name: "Apollo Meditech - Diagnostic Sync SLA", cust: 10, amt: 78000, status: "active" },
      { num: "SUB-DEMO-008", name: "Bharat Forge - Automated Shopfloor Telemetry", cust: 11, amt: 115000, status: "active" },
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
            source: SEED_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - 45 * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Subscriptions verified: 8 subscriptions.");

    // 1.7 Pricelists
    const pricelistDefs = [
      { name: "Standard Domestic INR Pricelist", currency: "INR" },
      { name: "Wholesale Enterprise Discount Tier", currency: "INR" },
      { name: "Strategic Partner Tier (15% Off)", currency: "INR" },
      { name: "Export Commercial Tier USD", currency: "USD" },
      { name: "Festive Q4 High-Volume Offer", currency: "INR" },
    ];
    for (const pl of pricelistDefs) {
      await db.collection("pricelists").updateOne(
        { tenantId: TENANT_ID, name: pl.name },
        {
          $set: {
            tenantId: TENANT_ID,
            name: pl.name,
            currencyId: pl.currency,
            items: products.slice(0, 5).map((p) => ({
              applied_on: "1_product",
              product_id: p._id,
              compute_price: "fixed",
              fixed_price: p.tab_general_information?.list_price || 15000,
            })),
            active: true,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Pricelists verified: 5 pricelists.");

    // 1.8 Payment Modes & Delivery Methods
    const defaultModes = ["NEFT/RTGS", "UPI Corporate", "Corporate Credit Card", "Cheque / DD", "Net Banking", "Cash"];
    for (const m of defaultModes) {
      await db.collection("paymentmodes").updateOne(
        { tenantId: TENANT_ID, name: m },
        { $set: { tenantId: TENANT_ID, name: m, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    }

    const defaultMethods = ["Standard Surface Logistics", "Express Air Cargo", "Dedicated Fleet Dispatch", "Local Depot Pickup"];
    for (const dm of defaultMethods) {
      await db.collection("deliverymethods").updateOne(
        { tenantId: TENANT_ID, name: dm },
        { $set: { tenantId: TENANT_ID, name: dm, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    }

    // 1.9 Document Settings & Prefixes
    await db.collection("documentsettings").updateOne(
      { tenantId: TENANT_ID },
      {
        $set: {
          tenantId: TENANT_ID,
          display: { showHsnSummary: true, showDispatchAddress: true },
          signatures: [
            {
              name: "Authorized Signatory",
              imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            },
          ],
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    console.log("Document settings & prefixes verified.");

    // ─────────────────────────────────────────────────────────────
    // 2. FINANCE MODULE SEEDING
    // ─────────────────────────────────────────────────────────────
    console.log("\n==> Step 2: Seeding Finance Module (COA, Bank Accounts, Vendors, Bills, POs, Expenses, Fixed Assets, Journal Entries, Budgets, Banking Rules, Period Closing)...");

    // 2.1 Chart of Accounts (COA)
    const coaAccounts = [
      { code: "1010", num: "1010", name: "Cash on Hand", type: "current_asset" },
      { code: "1050", num: "1050", name: "HDFC Bank Corporate Current", type: "bank" },
      { code: "1060", num: "1060", name: "ICICI Bank Operations", type: "bank" },
      { code: "1070", num: "1070", name: "SBI Statutory Tax Disbursement", type: "bank" },
      { code: "1100", num: "1100", name: "Accounts Receivable", type: "current_asset" },
      { code: "1200", num: "1200", name: "Inventory Asset Stock", type: "current_asset" },
      { code: "1500", num: "1500", name: "Plant & Machinery Equipment", type: "fixed_asset" },
      { code: "1510", num: "1510", name: "Office Workstations & Furniture", type: "fixed_asset" },
      { code: "1520", num: "1520", name: "Computer Hardware Cluster", type: "fixed_asset" },
      { code: "2000", num: "2000", name: "Accounts Payable", type: "current_liability" },
      { code: "2100", num: "2100", name: "GST Output CGST Payable", type: "current_liability" },
      { code: "2110", num: "2110", name: "GST Output SGST Payable", type: "current_liability" },
      { code: "2120", num: "2120", name: "GST Output IGST Payable", type: "current_liability" },
      { code: "2150", num: "2150", name: "TDS Payable (Section 194C/J)", type: "current_liability" },
      { code: "3000", num: "3000", name: "Shareholder Paid-up Capital", type: "equity" },
      { code: "3100", num: "3100", name: "Retained Earnings", type: "equity" },
      { code: "3305", num: "3305", name: "Opening Balance Equity", type: "equity" },
      { code: "4000", num: "4000", name: "Commercial ERP Software Revenue", type: "income" },
      { code: "4010", num: "4010", name: "Manufacturing Solution Deliveries", type: "income" },
      { code: "4020", num: "4020", name: "Annual Maintenance Contracts Revenue", type: "income" },
      { code: "5000", num: "5000", name: "Cost of Goods Sold (Direct Material)", type: "cogs" },
      { code: "5010", num: "5010", name: "Freight Inward & Handling", type: "cogs" },
      { code: "6000", num: "6000", name: "Employee Salaries & Allowances", type: "expense" },
      { code: "6050", num: "6050", name: "Staff Welfare & Health Benefits", type: "expense" },
      { code: "6100", num: "6100", name: "AWS Cloud & Azure Infrastructure", type: "expense" },
      { code: "6200", num: "6200", name: "Corporate Office Rent & Utilities", type: "expense" },
      { code: "6300", num: "6300", name: "Sales Outreach & Digital Marketing", type: "expense" },
      { code: "6400", num: "6400", name: "Legal & Regulatory Compliance Fees", type: "expense" },
      { code: "6600", num: "6600", name: "Depreciation & Amortization Expense", type: "expense" },
    ];

    const accIdMap: Record<string, ObjectId> = {};
    for (const a of coaAccounts) {
      const normalizedName = a.name.toLowerCase();
      const internalGroup = a.type === "fixed_asset" || a.type === "current_asset" || a.type === "bank"
        ? "asset"
        : a.type === "current_liability"
        ? "liability"
        : a.type === "equity"
        ? "equity"
        : a.type === "income"
        ? "income"
        : a.type === "cogs" || a.type === "expense"
        ? "expense"
        : "asset";
      const accountType = a.type === "fixed_asset"
        ? "asset_fixed"
        : a.type === "bank" || /cash on hand/.test(normalizedName)
        ? "asset_cash"
        : /inventory|stock/.test(normalizedName)
        ? "asset_current"
        : /accounts receivable/.test(normalizedName)
        ? "asset_receivable"
        : a.type === "current_asset"
        ? "asset_current"
        : a.type === "current_liability"
        ? "liability_current"
        : a.type === "equity"
        ? "equity"
        : a.type === "income"
        ? "income"
        : a.type === "cogs"
        ? "expense_direct_cost"
        : a.type === "expense"
        ? "expense"
        : "asset_current";
      const res = await db.collection("accounts").findOneAndUpdate(
        { tenantId: TENANT_ID, $or: [{ code: a.code }, { accountNumber: a.num }] },
        {
          $set: {
            tenantId: TENANT_ID,
            name: a.name,
            code: a.code,
            accountNumber: a.num,
            type: a.type,
            accountName: a.name,
            accountCode: a.code,
            account_type: accountType,
            internal_group: internalGroup,
            active: true,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after" }
      );
      if (res?._id) accIdMap[a.code] = res._id;
    }
    console.log(`Chart of Accounts verified: ${Object.keys(accIdMap).length} accounts.`);

    // 2.2 Bank Accounts (models/finance/BankAccount.ts: index { tenantId: 1, accountName: 1 })
    const bankDefs = [
      { name: "HDFC Bank Corporate Current", accNum: "50200012345678", ifsc: "HDFC0000123", bal: 4580000, code: "1050" },
      { name: "ICICI Bank Operations", accNum: "001205098765", ifsc: "ICIC0000012", bal: 2850000, code: "1060" },
      { name: "SBI Statutory Tax Disbursement", accNum: "38901234567", ifsc: "SBIN0001234", bal: 1420000, code: "1070" },
    ];
    for (const b of bankDefs) {
      await db.collection("bankaccounts").updateOne(
        { tenantId: TENANT_ID, accountName: b.name },
        {
          $set: {
            tenantId: TENANT_ID,
            accountType: "bank",
            accountName: b.name,
            bankName: b.name,
            accountNumber: b.accNum,
            ifsc: b.ifsc,
            currency: "INR",
            branch: "BKC Mumbai Branch",
            currentBalance: b.bal,
            glAccountId: accIdMap[b.code] || Object.values(accIdMap)[0],
            connectionStatus: "manual",
            isPrimary: b.name === "HDFC Bank Corporate Current",
            status: "active",
            isDemo: true,
            source: SEED_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Bank accounts verified: 3 accounts.");

    // 2.3 Vendors (Suppliers)
    const vendorDefs = [
      { name: "Hindalco Industrial Metals Ltd", cat: "Raw Materials", email: "sales@hindalco.demo", phone: "+919844000101", city: "Mumbai", gstin: "27AAACH1234F1Z1" },
      { name: "Bharat Forge Component Castings", cat: "Forging & Castings", email: "order@bharatforge.demo", phone: "+919844000102", city: "Pune", gstin: "27AAACB2345G1Z2" },
      { name: "Amazon Web Services India", cat: "IT & Cloud Services", email: "billing@aws.demo", phone: "+919844000103", city: "Bengaluru", gstin: "29AAACA3456H1Z3" },
      { name: "Blue Dart Express Logistics", cat: "Logistics & Freight", email: "corp@bluedart.demo", phone: "+919844000104", city: "Mumbai", gstin: "27AAACB4567J1Z4" },
      { name: "Tata Power Renewable Grid", cat: "Utilities", email: "billing@tatapower.demo", phone: "+919844000105", city: "Mumbai", gstin: "27AAACT5678K1Z5" },
      { name: "Supreme Petrochem Packaging", cat: "Packaging Materials", email: "pack@supreme.demo", phone: "+919844000106", city: "Navi Mumbai", gstin: "27AAACS6789L1Z6" },
      { name: "Cisco Systems Networking", cat: "IT Hardware", email: "cisco.india@cisco.demo", phone: "+919844000107", city: "Bengaluru", gstin: "29AAACC7890M1Z7" },
      { name: "Godrej Industrial Security", cat: "Security & Facilities", email: "security@godrej.demo", phone: "+919844000108", city: "Mumbai", gstin: "27AAACG8901N1Z8" },
    ];
    for (const v of vendorDefs) {
      await db.collection("vendors").updateOne(
        { tenantId: TENANT_ID, name: v.name },
        {
          $set: {
            tenantId: TENANT_ID,
            name: v.name,
            category: v.cat,
            contactEmail: v.email,
            phone: v.phone,
            state: "Maharashtra",
            country: "India",
            paymentTerms: "Net 30",
            isActive: true,
            isDemo: true,
            source: SEED_SOURCE,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Vendors verified: 8 vendors.");

    // 2.4 Vendor Bills (invoices collection with moveType: "in_invoice")
    const billDefs = [
      { num: "BILL-2026-001", amt: 125000, state: "posted", partner: customerIds[0], desc: "Raw Material Ingot Supply" },
      { num: "BILL-2026-002", amt: 85000, state: "posted", partner: customerIds[1], desc: "Industrial Packaging Material" },
      { num: "BILL-2026-003", amt: 220000, state: "posted", partner: customerIds[2], desc: "AWS & Cloud Telemetry Infrastructure" },
      { num: "BILL-2026-004", amt: 65000, state: "posted", partner: customerIds[3], desc: "Plant Facility Maintenance & Security" },
      { num: "BILL-2026-005", amt: 140000, state: "approved", partner: customerIds[4], desc: "Logistics Fleet Maintenance" },
      { num: "BILL-2026-006", amt: 45000, state: "draft", partner: customerIds[5], desc: "Office Supplies & Workstation Racks" },
      { num: "BILL-2026-007", amt: 310000, state: "posted", partner: customerIds[0], desc: "High-Grade Copper Windings Supply" },
      { num: "BILL-2026-008", amt: 175000, state: "posted", partner: customerIds[1], desc: "Quality Assurance Calibration Rig" },
      { num: "BILL-2026-009", amt: 92000, state: "approved", partner: customerIds[2], desc: "Quarterly Industrial Audit Fees" },
      { num: "BILL-2026-010", amt: 54000, state: "draft", partner: customerIds[3], desc: "Canteen & Health Welfare Supplies" },
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
            source: SEED_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - 20 * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Vendor bills verified: 10 bills.");

    // 2.5 Purchase Orders (PurchaseOrder model, partnerId references Customer doc)
    for (let po = 1; po <= 8; po++) {
      const poNum = `PO/2026/${String(po).padStart(4, "0")}`;
      const partner = customerIds[po % customerIds.length];
      const p = products[po % products.length] || products[0];
      const untaxed = 50000 + po * 20000;
      const tax = Math.round(untaxed * 0.18);
      const total = untaxed + tax;

      await db.collection("purchaseorders").updateOne(
        { tenantId: TENANT_ID, name: poNum },
        {
          $set: {
            tenantId: TENANT_ID,
            name: poNum,
            partnerId: partner,
            dateOrder: new Date(Date.now() - po * 5 * 86400000),
            orderLines: [
              {
                productId: p?._id,
                name: p?.name || "Industrial Component Supply",
                productQty: po * 5 + 10,
                receivedQty: po % 2 === 0 ? po * 5 + 10 : 0,
                billedQty: po % 2 === 0 ? po * 5 + 10 : 0,
                priceUnit: Math.round(untaxed / (po * 5 + 10)),
                taxIds: [],
                priceSubtotal: untaxed,
              },
            ],
            totals: {
              amountUntaxed: untaxed,
              amountTax: tax,
              amountTotal: total,
            },
            status: po % 2 === 0 ? "posted" : "approved",
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - po * 5 * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Purchase orders verified: 8 POs.");

    // 2.6 Corporate Expenses
    const expenseDefs = [
      { desc: "Q3 High-Speed Cloud Telemetry Deployment", cat: "Infrastructure", total: 45000, acc: "6100" },
      { desc: "Key Enterprise Client Onsite Workshop (Pune)", cat: "Travel & Boarding", total: 18500, acc: "6300" },
      { desc: "Annual ISO 27001 Surveillance Audit Fee", cat: "Legal & Professional", total: 75000, acc: "6400" },
      { desc: "Headquarters Fiber Optic Internet & Leased Line", cat: "Utilities", total: 12000, acc: "6200" },
      { desc: "Engineering Team AWS Certification Sponsorship", cat: "Staff Development", total: 32000, acc: "6050" },
      { desc: "Annual Corporate Health Checkup Camp", cat: "Staff Welfare", total: 28000, acc: "6050" },
      { desc: "Packaging Testing Rig Servicing & Recalibration", cat: "Plant Maintenance", total: 16500, acc: "5010" },
      { desc: "Sales Collateral Printing & Digital Brochures", cat: "Marketing", total: 14000, acc: "6300" },
    ];
    for (let ex = 0; ex < expenseDefs.length; ex++) {
      const item = expenseDefs[ex];
      await db.collection("expenses").updateOne(
        { tenantId: TENANT_ID, description: item.desc },
        {
          $set: {
            tenantId: TENANT_ID,
            description: item.desc,
            category: item.cat,
            total: item.total,
            taxAmount: Math.round(item.total * 0.18),
            isTaxIncluded: true,
            employeeId: adminUserId,
            paidBy: "company",
            expenseDate: new Date(Date.now() - (ex + 1) * 3 * 86400000),
            accountId: accIdMap[item.acc] || Object.values(accIdMap)[0],
            paymentAccountId: accIdMap["1050"] || Object.values(accIdMap)[0],
            status: "approved",
            chatter: [],
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (ex + 1) * 3 * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Corporate expenses verified: 8 expenses.");

    // 2.7 Fixed Assets
    // These were synthetic demo records with hard-coded asset-account mappings.
    // Remove only exact records created by this seed source and their linked
    // capitalization journals; unrelated user-entered assets and journals stay.
    const removedDemoAssetNames = [
      "Heavy Duty Logistics Delivery Truck (MH-04-AB-1234)",
      "CNC High-Precision Milling Station #1",
      "High-Availability Server Rack Hardware Cluster",
      "Executive Ergonomic Office Furniture Suite",
      "Rooftop 50kW Industrial Solar Array Installation",
      "Advanced Materials Testing Laboratory Rig",
    ];
    const seededAssetsToRemove = await db.collection("assets").find({
      tenantId: TENANT_ID,
      isDemo: true,
      source: SEED_SOURCE,
      name: { $in: removedDemoAssetNames },
    }, { projection: { _id: 1 } }).toArray();
    const seededAssetRefs = seededAssetsToRemove.map((asset) => `CAP/${asset._id}`);
    if (seededAssetRefs.length) {
      await db.collection("journalentries").updateMany({
        tenantId: TENANT_ID,
        "header.ref": { $in: seededAssetRefs },
      }, {
        $set: {
          status: "cancelled",
          voucherStatus: "cancelled",
          cancellationReason: "Synthetic fixed-asset seed data removed; retained for audit history.",
          updatedAt: new Date(),
        },
      });
      await db.collection("assets").deleteMany({
        tenantId: TENANT_ID,
        isDemo: true,
        source: SEED_SOURCE,
        _id: { $in: seededAssetsToRemove.map((asset) => asset._id) },
      });
    }
    console.log(`Removed ${seededAssetsToRemove.length} hard-coded demo fixed assets and cancelled their linked capitalization journals.`);

    // 2.8 Balanced Journal Entries (Debit == Credit)
    const journalEntries = [
      { num: "JE-DEMO-2026-001", date: new Date("2026-08-31"), desc: "August 2026 Revenue Recognition", debit: "1100", credit: "4000", amt: 8500000 },
      { num: "JE-DEMO-2026-002", date: new Date("2026-08-31"), desc: "August 2026 Payroll Disbursement", debit: "6000", credit: "1050", amt: 5200000 },
      { num: "JE-DEMO-2026-003", date: new Date("2026-09-30"), desc: "September 2026 Enterprise Software Billing", debit: "1100", credit: "4000", amt: 11200000 },
      { num: "JE-DEMO-2026-004", date: new Date("2026-09-30"), desc: "September 2026 Material Consumption", debit: "5000", credit: "1200", amt: 4100000 },
      { num: "JE-DEMO-2026-005", date: new Date("2026-09-30"), desc: "September 2026 Facility Rent & Power", debit: "6200", credit: "1050", amt: 850000 },
      { num: "JE-DEMO-2026-006", date: new Date("2026-10-15"), desc: "October 2026 Commercial Deliveries", debit: "1100", credit: "4000", amt: 9400000 },
      { num: "JE-DEMO-2026-007", date: new Date("2026-10-15"), desc: "October 2026 Operational Logistics", debit: "6100", credit: "1050", amt: 1250000 },
    ];
    for (const je of journalEntries) {
      const dAcc = accIdMap[je.debit] || Object.values(accIdMap)[0];
      const cAcc = accIdMap[je.credit] || Object.values(accIdMap)[0];
      await db.collection("journalentries").updateOne(
        { tenantId: TENANT_ID, "header.name": je.num },
        {
          $set: {
            tenantId: TENANT_ID,
            header: {
              name: je.num,
              date: je.date,
              ref: je.desc,
              journalType: "general",
            },
            lineIds: [
              { accountId: dAcc, label: `${je.desc} - Debit`, debit: je.amt, credit: 0 },
              { accountId: cAcc, label: `${je.desc} - Credit`, debit: 0, credit: je.amt },
            ],
            totals: {
              currencyId: "INR",
              amountUntaxed: je.amt,
              amountTax: 0,
              amountTotal: je.amt,
            },
            status: "posted",
            voucherType: "journal",
            voucherStatus: "validated",
            approvalRequired: false,
            isDemo: true,
            source: SEED_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: je.date },
        },
        { upsert: true }
      );
    }
    // Older demo invoice journals resolved receivables by code 1200. In this
    // tenant 1200 was the inventory ledger, so move only the seeded invoice
    // debit lines to the account explicitly classified as receivable.
    const receivableAccountId = accIdMap["1100"];
    const inventoryAccountId = accIdMap["1200"];
    const demoInvoiceEntries = await db.collection("journalentries").find({
      tenantId: TENANT_ID,
      status: "posted",
      "header.name": { $in: Array.from({ length: 8 }, (_, index) => `SAL/2026/${String(index + 1).padStart(4, "0")}`) },
      "lineIds.accountId": inventoryAccountId,
    }, { projection: { lineIds: 1 } }).toArray();
    for (const entry of demoInvoiceEntries) {
      const lines = (entry.lineIds || []).map((line: any) =>
        line.accountId?.equals?.(inventoryAccountId) &&
        /^Invoice INV-/.test(line.label || "") &&
        Number(line.debit) > 0
          ? { ...line, accountId: receivableAccountId }
          : line,
      );
      await db.collection("journalentries").updateOne(
        { _id: entry._id, tenantId: TENANT_ID },
        { $set: { lineIds: lines, updatedAt: new Date() } },
      );
    }

    // Reconcile seed opening balances to the same persisted sources used by
    // the UI: BankAccount.currentBalance for HDFC and non-service Product/Stock
    // valuation for inventory. The InventoryItem legacy list is not added a
    // second time; that would double-count a different inventory dataset.
    const openingEquityAccountId = accIdMap["3305"];
    const seededBankSnapshots = await db.collection("bankaccounts").find({
      tenantId: TENANT_ID,
      source: SEED_SOURCE,
      accountName: { $in: bankDefs.map((bank) => bank.name) },
    }).toArray();
    if (!seededBankSnapshots.length || !openingEquityAccountId) {
      throw new Error("Finance opening-balance source account is missing.");
    }

    const trackedProducts = products.filter((product) =>
      product.tab_general_information?.type !== "service" && product.status !== "archived"
    );
    const stockByProduct = await db.collection("stocks").aggregate([
      { $match: { tenantId: TENANT_ID } },
      { $group: { _id: "$product", quantity: { $sum: "$quantity" } } },
    ]).toArray();
    const stockQuantityByProduct = new Map(
      stockByProduct.map((row) => [String(row._id), Number(row.quantity) || 0]),
    );
    const inventoryClosingValue = trackedProducts.reduce((total, product) => {
      const onHand = stockQuantityByProduct.get(String(product._id)) || 0;
      const unitCost = Number(product.tab_general_information?.standard_price) || 0;
      return total + (onHand > 0 ? onHand * unitCost : 0);
    }, 0);

    const openingEntryName = "JE-DEMO-OPENING-BALANCES";
    const priorPostedEntries = await db.collection("journalentries").find({
      tenantId: TENANT_ID,
      status: "posted",
      "header.name": { $ne: openingEntryName },
    }, { projection: { lineIds: 1 } }).toArray();
    const postedBalanceByAccount = new Map<string, number>();
    for (const entry of priorPostedEntries) {
      for (const line of entry.lineIds || []) {
        const id = String(line.accountId);
        const signed = (Number(line.debit) || 0) - (Number(line.credit) || 0);
        postedBalanceByAccount.set(id, (postedBalanceByAccount.get(id) || 0) + signed);
      }
    }
    const openingAdjustments = [
      ...seededBankSnapshots.map((bank: any) => {
        const bankDef = bankDefs.find((candidate) => candidate.name === bank.accountName);
        const accountId = bankDef ? accIdMap[bankDef.code] : null;
        if (!accountId) throw new Error(`No GL account is configured for bank account ${bank.accountName}.`);
        return {
          accountId,
          label: `${bank.accountName} opening balance`,
          amount: Number(bank.currentBalance) - (postedBalanceByAccount.get(String(accountId)) || 0),
        };
      }),
      {
        accountId: inventoryAccountId,
        label: "Inventory opening stock value — Product + Stock valuation",
        amount: inventoryClosingValue - (postedBalanceByAccount.get(String(inventoryAccountId)) || 0),
      },
    ].filter((adjustment) => Math.abs(adjustment.amount) > 0.01);
    const openingBalanceTotal = openingAdjustments.reduce((total, adjustment) => total + adjustment.amount, 0);
    const openingBalanceLines = openingAdjustments.map((adjustment) => ({
      accountId: adjustment.accountId,
      label: adjustment.label,
      debit: adjustment.amount > 0 ? adjustment.amount : 0,
      credit: adjustment.amount < 0 ? Math.abs(adjustment.amount) : 0,
    }));
    openingBalanceLines.push({
      accountId: openingEquityAccountId,
      label: "Opening balance equity counterpart",
      debit: openingBalanceTotal < 0 ? Math.abs(openingBalanceTotal) : 0,
      credit: openingBalanceTotal > 0 ? openingBalanceTotal : 0,
    });
    const totalOpeningDebits = openingBalanceLines.reduce((total, line) => total + line.debit, 0);
    const totalOpeningCredits = openingBalanceLines.reduce((total, line) => total + line.credit, 0);
    if (Math.abs(totalOpeningDebits - totalOpeningCredits) > 0.01) {
      throw new Error("Seeded opening balance journal is not balanced.");
    }
    await db.collection("journalentries").updateOne(
      { tenantId: TENANT_ID, "header.name": openingEntryName },
      {
        $set: {
          tenantId: TENANT_ID,
          header: {
            name: "JE-DEMO-OPENING-BALANCES",
            date: new Date("2024-03-01T00:00:00.000Z"),
            ref: "Seeded opening balances for HDFC and inventory",
            journalType: "general",
          },
          lineIds: openingBalanceLines,
          totals: {
            currencyId: "INR",
            amountUntaxed: openingBalanceTotal,
            amountTax: 0,
            amountTotal: openingBalanceTotal,
          },
          status: "posted",
          voucherType: "journal",
          voucherStatus: "validated",
          approvalRequired: false,
          isDemo: true,
          source: SEED_SOURCE,
          createdBy: adminUserId,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date("2024-03-01T00:00:00.000Z") },
      },
      { upsert: true },
    );
    console.log("Balanced journal entries verified, including seeded current-asset opening balances.");

    // 2.9 Bank Statements
    const bAcc = accIdMap["1050"] || Object.values(accIdMap)[0];
    const bankStatementSnapshots = [
      { date: new Date("2026-08-31T00:00:00.000Z"), start: 11880000, end: 6680000, description: "August Payroll Disbursement", amount: -5200000, journalDate: new Date("2026-08-31T00:00:00.000Z") },
      { date: new Date("2026-09-30T00:00:00.000Z"), start: 6680000, end: 5830000, description: "September Facility Rent & Power", amount: -850000, journalDate: new Date("2026-09-30T00:00:00.000Z") },
      { date: new Date("2026-10-28T00:00:00.000Z"), start: 5830000, end: 4580000, description: "October Operational Logistics", amount: -1250000, journalDate: new Date("2026-10-15T00:00:00.000Z") },
    ];
    for (let st = 1; st <= 3; st++) {
      const stName = `BS-2026-0${st}`;
      const statement = bankStatementSnapshots[st - 1];
      await db.collection("bankstatements").updateOne(
        { tenantId: TENANT_ID, "header.name": stName },
        {
          $set: {
            tenantId: TENANT_ID,
            header: {
              name: stName,
              journalId: bAcc,
              date: statement.date,
              balance_start: statement.start,
              balance_end_real: statement.end,
            },
            lineIds: [
              {
                date: statement.journalDate,
                payment_ref: statement.description,
                partnerId: null,
                amount: statement.amount,
                isReconciled: true,
              },
            ],
            status: "posted",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: statement.date },
        },
        { upsert: true }
      );
    }
    console.log("Bank statements verified: 3 statements.");

    // 2.10 Budgets
    await db.collection("budgets").updateOne(
      { tenantId: TENANT_ID, name: "FY2026-27 Corporate Master Budget", fiscalYear: "2026-2027" },
      {
        $set: {
          tenantId: TENANT_ID,
          name: "FY2026-27 Corporate Master Budget",
          fiscalYear: "2026-2027",
          period: "monthly",
          lines: [
            {
              accountId: accIdMap["6000"] || Object.values(accIdMap)[0],
              segment: "Department",
              amounts: [
                { periodLabel: "Apr 2026", amount: 550000 },
                { periodLabel: "May 2026", amount: 550000 },
                { periodLabel: "Jun 2026", amount: 550000 },
                { periodLabel: "Jul 2026", amount: 600000 },
                { periodLabel: "Aug 2026", amount: 600000 },
                { periodLabel: "Sep 2026", amount: 600000 },
              ],
            },
            {
              accountId: accIdMap["6100"] || Object.values(accIdMap)[0],
              segment: "Project",
              amounts: [
                { periodLabel: "Apr 2026", amount: 150000 },
                { periodLabel: "May 2026", amount: 150000 },
                { periodLabel: "Jun 2026", amount: 150000 },
                { periodLabel: "Jul 2026", amount: 180000 },
                { periodLabel: "Aug 2026", amount: 180000 },
                { periodLabel: "Sep 2026", amount: 180000 },
              ],
            },
          ],
          includeBalanceSheetAccounts: false,
          status: "active",
          createdBy: adminUserId,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date("2026-04-01") },
      },
      { upsert: true }
    );
    console.log("Corporate master budget verified.");

    // 2.11 Banking Rules
    const bankingRuleDefs = [
      { name: "Auto Categorize Bank Interest", match: "contains", val: "INTEREST", acc: "4000" },
      { name: "Auto Categorize Bank Service Charges", match: "contains", val: "CHARGES", acc: "6400" },
      { name: "Auto Categorize Corporate Leased Line", match: "contains", val: "AIRTEL", acc: "6200" },
      { name: "Auto Categorize AWS Cloud Telemetry", match: "contains", val: "AMAZON WEB", acc: "6100" },
    ];
    for (const br of bankingRuleDefs) {
      await db.collection("bankingrules").updateOne(
        { tenantId: TENANT_ID, ruleName: br.name },
        {
          $set: {
            tenantId: TENANT_ID,
            ruleName: br.name,
            applyTo: "both",
            transactionHandling: "create_transaction",
            criteriaMatch: "any",
            criteria: [{ field: "description", operator: br.match, value: br.val }],
            recordAs: "expense",
            accountId: accIdMap[br.acc] || Object.values(accIdMap)[0],
            associateAccountsMode: "all",
            associatedAccountIds: [],
            status: "active",
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Banking rules verified: 4 rules.");

    // 2.12 Period Closings
    const periods = [
      { name: "FY2026-Q1", year: 2026, month: 6, q: 1, status: "closed" },
      { name: "FY2026-Q2", year: 2026, month: 9, q: 2, status: "closed" },
      { name: "FY2026-Q3", year: 2026, month: 12, q: 3, status: "open" },
    ];
    for (const p of periods) {
      await db.collection("periodclosings").updateOne(
        { tenantId: TENANT_ID, name: p.name },
        {
          $set: {
            tenantId: TENANT_ID,
            name: p.name,
            fiscalYear: p.year,
            month: p.month,
            quarter: p.q,
            status: p.status,
            depreciationRun: p.status === "closed",
            closedAt: p.status === "closed" ? new Date(p.year, p.month, 0) : null,
            snapshot: {
              totalRevenue: 28500000,
              totalExpenses: 16800000,
              netIncome: 11700000,
              totalAssets: 45200000,
              totalLiabilities: 12400000,
              totalEquity: 32800000,
            },
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Period closings verified: 3 quarters.");

    // ─────────────────────────────────────────────────────────────
    // 3. MANUFACTURING MODULE SEEDING
    // ─────────────────────────────────────────────────────────────
    console.log("\n==> Step 3: Seeding Manufacturing Module (Items, Item BOMs, Bill of Materials, Orders, Shipments, Air Freight, Customs, Freight Providers, HS Codes, Coupons)...");

    // 3.1 Items (models/manufacturing/Item.ts)
    const mfgItemDefs = [
      { sku: "MFG-INV-5KW", name: "High-Efficiency Solar Inverter 5kW Grid-Tie", type: "goods", cat: "Finished Goods", price: 48000, cost: 32000 },
      { sku: "MFG-MOT-2HP", name: "Three-Phase Induction Motor 2HP 415V", type: "goods", cat: "Finished Goods", price: 28000, cost: 18500 },
      { sku: "MFG-PCB-CTRL", name: "Microcontroller Inverter Control Board V4", type: "goods", cat: "Sub-Assemblies", price: 8500, cost: 5200 },
      { sku: "MFG-HSNK-ALU", name: "Extruded Aluminium Heat Sink 450mm", type: "goods", cat: "Raw Materials", price: 2400, cost: 1400 },
      { sku: "MFG-CAP-450V", name: "High-Ripple Electrolytic Capacitor Bank", type: "goods", cat: "Components", price: 1800, cost: 950 },
      { sku: "MFG-ENC-IP65", name: "Weatherproof IP65 Industrial Steel Enclosure", type: "goods", cat: "Raw Materials", price: 6500, cost: 4100 },
      { sku: "MFG-CAB-HV", name: "High-Voltage Shielded Copper Harness 10AWG", type: "goods", cat: "Components", price: 1200, cost: 650 },
      { sku: "MFG-DISP-LCD", name: "Digital Telemetry LCD Backlit Display Unit", type: "goods", cat: "Components", price: 3200, cost: 1900 },
    ];
    const mfgItemMap: Record<string, ObjectId> = {};
    for (const it of mfgItemDefs) {
      const res = await db.collection("items").findOneAndUpdate(
        { tenantId: TENANT_ID, sku: it.sku },
        {
          $set: {
            tenantId: TENANT_ID,
            name: it.name,
            sku: it.sku,
            type: it.type,
            category: it.cat,
            itemType: "single",
            unit: "Units",
            images: { others: [] },
            identifiers: [{ identifierType: "SKU", value: it.sku }],
            salesInfo: { enabled: true, sellingPrice: it.price, currency: "INR" },
            purchaseInfo: { enabled: true, costPrice: it.cost, currency: "INR" },
            inventoryTracking: { enabled: true, valuationMethod: "fifo", reorderPoint: 20 },
            fulfillment: { length: 45, width: 30, height: 20, dimensionUnit: "cm", weight: 12, weightUnit: "kg" },
            status: "approved",
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, returnDocument: "after" }
      );
      if (res?._id) mfgItemMap[it.sku] = res._id;
    }
    console.log(`Manufacturing catalog items verified: ${Object.keys(mfgItemMap).length} items.`);

    // 3.2 Item BOMs (models/manufacturing/ItemBOM.ts)
    const bomDefs = [
      {
        num: "BOM-INV5KW-01",
        name: "Bill of Materials - Solar Inverter 5kW Standard",
        produceSku: "MFG-INV-5KW",
        components: [
          { sku: "MFG-PCB-CTRL", qty: 1 },
          { sku: "MFG-HSNK-ALU", qty: 2 },
          { sku: "MFG-CAP-450V", qty: 4 },
          { sku: "MFG-ENC-IP65", qty: 1 },
          { sku: "MFG-CAB-HV", qty: 3 },
          { sku: "MFG-DISP-LCD", qty: 1 },
        ],
        ops: [
          { name: "PCB Surface Mount Assembly & Soldering", duration: 45 },
          { name: "Heatsink & Power Semiconductor Thermal Bonding", duration: 30 },
          { name: "Full Electrical High-Pot & Functional Testing", duration: 25 },
        ],
      },
      {
        num: "BOM-MOT2HP-01",
        name: "Bill of Materials - 2HP Induction Motor Heavy Duty",
        produceSku: "MFG-MOT-2HP",
        components: [
          { sku: "MFG-ENC-IP65", qty: 1 },
          { sku: "MFG-CAB-HV", qty: 2 },
          { sku: "MFG-CAP-450V", qty: 2 },
        ],
        ops: [
          { name: "Stator Winding & Vacuum Impregnation", duration: 60 },
          { name: "Rotor Dynamic Balancing & Bearing Fit", duration: 40 },
        ],
      },
    ];

    const itemBomMap: Record<string, ObjectId> = {};
    for (const b of bomDefs) {
      const produceId = mfgItemMap[b.produceSku] || Object.values(mfgItemMap)[0];
      const res = await db.collection("itemboms").findOneAndUpdate(
        { tenantId: TENANT_ID, bomNumber: b.num },
        {
          $set: {
            tenantId: TENANT_ID,
            name: b.name,
            bomNumber: b.num,
            itemToProduceId: produceId,
            quantity: 1,
            description: "Production-ready engineering master BOM with full QA checkpoints.",
            components: b.components.map((c) => ({
              itemId: mfgItemMap[c.sku] || Object.values(mfgItemMap)[0],
              quantity: c.qty,
              unit: "Units",
            })),
            operations: b.ops.map((o) => ({ name: o.name, duration: o.duration, notes: "Automated logging enabled." })),
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, returnDocument: "after" }
      );
      if (res?._id) itemBomMap[b.num] = res._id;
    }
    console.log(`Item BOMs verified: ${Object.keys(itemBomMap).length} BOMs.`);

    // 3.3 MRP BillOfMaterials & Manufacturing Orders
    const solarProd = prodMap["PRD-SOLAR5"] || products[0];
    const bearingProd = prodMap["PRD-BEARING"] || products[1] || products[0];
    const pkgProd = prodMap["PRD-PKG"] || products[2] || products[0];

    let mrpBom = await db.collection("billofmaterials").findOne({ tenantId: TENANT_ID, "header.productId": solarProd?._id });
    let mrpBomId = mrpBom?._id;
    if (!mrpBom && solarProd?._id) {
      const res = await db.collection("billofmaterials").insertOne({
        tenantId: TENANT_ID,
        header: { productId: solarProd._id, bomType: "mrp" },
        components_tab: [
          { productId: bearingProd?._id, quantity: 4 },
          { productId: pkgProd?._id, quantity: 2 },
        ],
        active: true,
        isDemo: true,
        source: SEED_SOURCE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mrpBomId = res.insertedId;
    }

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
              productId: solarProd?._id,
              quantity: mo.qty,
              bomId: mrpBomId,
              scheduledDate: mo.date,
              responsibleId: adminUserId,
            },
            components_tab: [
              { productId: bearingProd?._id, toConsume: mo.qty * 4, consumed: mo.status === "done" ? mo.qty * 4 : 0 },
              { productId: pkgProd?._id, toConsume: mo.qty * 2, consumed: mo.status === "done" ? mo.qty * 2 : 0 },
            ],
            productionStatus: mo.status,
            status: mo.status === "done" ? "closed" : (mo.status === "in_production" ? "approved" : "draft"),
            reworkCount: 0,
            isDemo: true,
            source: SEED_SOURCE,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: mo.date },
        },
        { upsert: true }
      );
    }
    console.log("Manufacturing orders verified: 7 MOs.");

    // 3.4 Freight Providers (models/manufacturing/FreightProvider.ts)
    const providerDefs = [
      { code: "FP-BLUEDART", name: "Blue Dart Express", type: "air", contact: "Rajiv Khurana", email: "rajiv@bluedart.demo", phone: "+919811223301" },
      { code: "FP-DHL", name: "DHL Global Forwarding", type: "multimodal", contact: "Sarah Jenkins", email: "sarah@dhl.demo", phone: "+919811223302" },
      { code: "FP-CONCOR", name: "Container Corporation of India", type: "rail", contact: "Sunil Verma", email: "sunil@concor.demo", phone: "+919811223303" },
      { code: "FP-VRL", name: "VRL Logistics Road Cargo", type: "road", contact: "Venkatesh Rao", email: "venkat@vrl.demo", phone: "+919811223304" },
      { code: "FP-MAERSK", name: "Maersk Line Ocean Transport", type: "sea", contact: "Hans Nielsen", email: "hans@maersk.demo", phone: "+919811223305" },
      { code: "FP-FEDEX", name: "FedEx International Priority", type: "air", contact: "Karan Johar", email: "karan@fedex.demo", phone: "+919811223306" },
    ];
    for (const fp of providerDefs) {
      await db.collection("freightproviders").updateOne(
        { tenantId: TENANT_ID, providerCode: fp.code },
        {
          $set: {
            tenantId: TENANT_ID,
            providerName: fp.name,
            providerCode: fp.code,
            providerType: fp.type,
            contactPerson: fp.contact,
            contactEmail: fp.email,
            contactPhone: fp.phone,
            servicesOffered: ["Express Cargo", "Customs Bonded Handling", "Door-to-Door Delivery"],
            coverage: ["India Domestic", "Southeast Asia", "Middle East", "Europe"],
            rateStructure: { baseRate: 1500, currency: "INR", perKg: 45, perCbm: 420 },
            status: "active",
            rating: 4.8,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Freight providers verified: 6 providers.");

    // 3.5 Shipments (models/manufacturing/Shipment.ts)
    const shipmentDefs = [
      { num: "SHP-2026-001", cust: "Tata Steel Logistics Ltd", orig: "Mumbai, MH", dest: "Jamshedpur, JH", type: "road", fp: "VRL Logistics Road Cargo", wt: 4500, val: 1250000, stat: "delivered" },
      { num: "SHP-2026-002", cust: "Reliance Jio Infocomm", orig: "Pune, MH", dest: "Navi Mumbai, MH", type: "road", fp: "Blue Dart Express", wt: 1800, val: 890000, stat: "in_transit" },
      { num: "SHP-2026-003", cust: "Infosys BPM Tech Services", orig: "Mumbai, MH", dest: "Bengaluru, KA", type: "air", fp: "Blue Dart Express", wt: 650, val: 1450000, stat: "customs_hold" },
      { num: "SHP-2026-004", cust: "Larsen & Toubro Heavy Inf", orig: "Chakan, MH", dest: "Chennai, TN", type: "rail", fp: "Container Corporation of India", wt: 8500, val: 3200000, stat: "in_transit" },
      { num: "SHP-2026-005", cust: "Bajaj Auto Distribution", orig: "Pune, MH", dest: "Ahmedabad, GJ", type: "road", fp: "VRL Logistics Road Cargo", wt: 2200, val: 680000, stat: "delivered" },
      { num: "SHP-2026-006", cust: "Apollo Meditech Labs", orig: "Bengaluru, KA", dest: "Hyderabad, TS", type: "air", fp: "FedEx International Priority", wt: 420, val: 1850000, stat: "delivered" },
    ];
    for (const sh of shipmentDefs) {
      await db.collection("shipments").updateOne(
        { tenantId: TENANT_ID, shipmentNumber: sh.num },
        {
          $set: {
            tenantId: TENANT_ID,
            shipmentNumber: sh.num,
            customerName: sh.cust,
            origin: sh.orig,
            destination: sh.dest,
            freightProvider: sh.fp,
            trackingNumber: `TRK-${sh.num}-IND`,
            shipmentType: sh.type,
            weight: sh.wt,
            volume: Math.round(sh.wt / 250),
            items: [
              {
                description: "Industrial Control & Power Conversion Assemblies",
                hsCode: "8504.40.90",
                quantity: 10,
                weight: sh.wt,
                value: sh.val,
              },
            ],
            totalValue: sh.val,
            currency: "INR",
            status: sh.stat,
            estimatedDelivery: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
            customsStatus: sh.stat === "customs_hold" ? "under_inspection" : "cleared",
            notes: "Inspected at dispatch dock, serial tags verified.",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Shipments verified: 6 logistics shipments.");

    // 3.6 Air Freight Schedules (models/manufacturing/AirFreight.ts)
    const airFreightDefs = [
      { flight: "AI-865", airline: "Air India Cargo", orig: "BOM (Mumbai)", dest: "DEL (New Delhi)", cargo: 2400, stat: "in_transit" },
      { flight: "6E-904", airline: "IndiGo CarGo", orig: "BOM (Mumbai)", dest: "BLR (Bengaluru)", cargo: 1850, stat: "delivered" },
      { flight: "SG-712", airline: "SpiceXpress Freight", orig: "PNQ (Pune)", dest: "HYD (Hyderabad)", cargo: 1200, stat: "scheduled" },
      { flight: "EK-501", airline: "Emirates SkyCargo", orig: "BOM (Mumbai)", dest: "DXB (Dubai)", cargo: 4500, stat: "scheduled" },
    ];
    for (const af of airFreightDefs) {
      await db.collection("airfreights").updateOne(
        { tenantId: TENANT_ID, flightNumber: af.flight },
        {
          $set: {
            tenantId: TENANT_ID,
            flightNumber: af.flight,
            airline: af.airline,
            origin: af.orig,
            destination: af.dest,
            departureTime: new Date(Date.now() + 12 * 3600000),
            arrivalTime: new Date(Date.now() + 15 * 3600000),
            status: af.stat,
            cargo: af.cargo,
            cargoUnit: "kg",
            aircraftType: "Boeing 777-300ER / A321P2F",
            notes: "High-priority avionics and electronic sub-assemblies payload.",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Air freight schedules verified: 4 flights.");

    // 3.7 Customs Clearance (models/manufacturing/CustomsClearance.ts)
    const customsDefs = [
      { num: "CC-2026-001", shp: "SHP-2026-001", office: "JNPT Customs House, Nhava Sheva", type: "import", val: 1250000, duty: 93750, tax: 225000, stat: "approved" },
      { num: "CC-2026-003", shp: "SHP-2026-003", office: "Air Cargo Complex, Sahar, Mumbai", type: "export", val: 1450000, duty: 0, tax: 0, stat: "pending_approval" },
      { num: "CC-2026-006", shp: "SHP-2026-006", office: "Bangalore Air Cargo Terminal", type: "import", val: 1850000, duty: 138750, tax: 333000, stat: "approved" },
    ];
    for (const cc of customsDefs) {
      await db.collection("customsclearances").updateOne(
        { tenantId: TENANT_ID, clearanceNumber: cc.num },
        {
          $set: {
            tenantId: TENANT_ID,
            clearanceNumber: cc.num,
            shipmentNumber: cc.shp,
            customsOffice: cc.office,
            country: "India",
            declarationType: cc.type,
            totalValue: cc.val,
            currency: "INR",
            totalDuty: cc.duty,
            totalTax: cc.tax,
            status: cc.stat,
            submittedDate: new Date(Date.now() - 5 * 86400000).toISOString().split("T")[0],
            clearedDate: cc.stat === "approved" ? new Date().toISOString().split("T")[0] : undefined,
            documents: [
              { documentType: "Bill of Entry", documentNumber: `BOE-${cc.num}`, uploadedAt: new Date() },
              { documentType: "Commercial Invoice", documentNumber: `INV-${cc.num}`, uploadedAt: new Date() },
            ],
            items: [
              {
                description: "Power Inverter Sub-Assemblies & Power Electronics",
                hsCode: "8504.40.90",
                quantity: 10,
                value: cc.val,
                dutyRate: 7.5,
                taxRate: 18,
                dutyAmount: cc.duty,
                taxAmount: cc.tax,
              },
            ],
            remarks: "Standard valuation approved by assistant commissioner of customs.",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Customs clearances verified: 3 records.");

    // 3.8 HS Codes (models/manufacturing/HSCode.ts)
    const hsCodeDefs = [
      { code: "8504.40.90", desc: "Static Converters & Solar Inverters", cat: "Electrical Machinery", duty: 7.5, tax: 18 },
      { code: "8501.52.10", desc: "AC Multi-phase Induction Motors (> 750W to 75kW)", cat: "Electrical Machinery", duty: 7.5, tax: 18 },
      { code: "8482.10.11", desc: "Thrust Ball Bearings of Bore Diameter Not Exceeding 50mm", cat: "Nuclear Reactors, Boilers, Machinery", duty: 7.5, tax: 18 },
      { code: "8537.10.00", desc: "Boards, Panels, Consoles for Electric Control <= 1,000V", cat: "Electrical Machinery", duty: 10.0, tax: 18 },
      { code: "3923.21.00", desc: "Sacks and Bags of Polymers of Ethylene for Packaging", cat: "Plastics and Articles Thereof", duty: 10.0, tax: 18 },
      { code: "7308.90.90", desc: "Steel Structures and Parts (Storage Racks and Frames)", cat: "Articles of Iron or Steel", duty: 10.0, tax: 18 },
    ];
    for (const hs of hsCodeDefs) {
      await db.collection("hscodes").updateOne(
        { tenantId: TENANT_ID, hsCode: hs.code },
        {
          $set: {
            tenantId: TENANT_ID,
            hsCode: hs.code,
            description: hs.desc,
            category: hs.cat,
            dutyRate: hs.duty,
            taxRate: hs.tax,
            restrictions: ["BIS Certification Mandatory"],
            requiredDocuments: ["Test Certificate", "Country of Origin Certificate"],
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("HS codes verified: 6 codes.");

    // 3.9 Promotional Coupons (models/manufacturing/Coupon.ts)
    const couponDefs = [
      { code: "ENTERPRISE2026", name: "Q4 Enterprise ERP Adoption Discount", val: 15, type: "order-level", min: 100000 },
      { code: "SOLAR10", name: "Green Energy Solar Inverter Commercial Rebate", val: 10, type: "item-level", min: 50000 },
      { code: "AMC25K", name: "Annual Maintenance Contract Flat Discount", val: 25000, type: "order-level", min: 200000 },
    ];
    for (const cp of couponDefs) {
      await db.collection("coupons").updateOne(
        { tenantId: TENANT_ID, couponCode: cp.code },
        {
          $set: {
            tenantId: TENANT_ID,
            name: cp.name,
            couponCode: cp.code,
            discountType: cp.type,
            applicableProducts: "all",
            applicableItems: "all",
            redemptionType: "unlimited",
            discountBy: cp.val > 100 ? "flat-rate" : "percentage",
            discountValue: cp.val,
            currency: "INR",
            eligibleCustomers: "all",
            minimumOrderAmount: cp.min,
            neverExpires: true,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Coupons verified: 3 coupons.");

    // ─────────────────────────────────────────────────────────────
    // 4. CRM MODULE SEEDING
    // ─────────────────────────────────────────────────────────────
    console.log("\n==> Step 4: Seeding CRM Module (Accounts, Contacts, Leads, Opportunities, Activities, Tasks, Cases, Quotes, Contracts, Campaigns, Field Visits, Communications, Onboarding, Notifications)...");

    // 4.1 CRM Accounts (models/crm/Account.ts: company_name, type, industry, size, status, owner_id)
    const crmAccDefs = [
      { name: "Tata Steel Logistics Ltd", ind: "Manufacturing & Metals", size: "500+", rev: 250000000, type: "Customer", health: 92 },
      { name: "Reliance Jio Infocomm", ind: "Telecommunications & Cloud", size: "500+", rev: 890000000, type: "Customer", health: 88 },
      { name: "Infosys BPM Tech Services", ind: "Information Technology", size: "500+", rev: 450000000, type: "Customer", health: 95 },
      { name: "Larsen & Toubro Heavy Inf", ind: "Heavy Engineering", size: "500+", rev: 620000000, type: "Customer", health: 84 },
      { name: "Bajaj Auto Distribution", ind: "Automotive", size: "500+", rev: 380000000, type: "Customer", health: 90 },
      { name: "Mahindra Logistics Hub", ind: "Transportation & Freight", size: "201-500", rev: 290000000, type: "Customer", health: 82 },
      { name: "Adani Green Energy Grid", ind: "Renewables & Utilities", size: "500+", rev: 520000000, type: "Prospect", health: 75 },
      { name: "Apollo Meditech Labs", ind: "Healthcare & Diagnostics", size: "51-200", rev: 140000000, type: "Customer", health: 91 },
    ];
    const crmAccIds: ObjectId[] = [];
    for (const ca of crmAccDefs) {
      let acc = await db.collection("crmaccounts").findOne({
        tenantId: TENANT_ID,
        $or: [{ company_name: ca.name }, { name: ca.name }],
      });
      if (!acc) {
        const res = await db.collection("crmaccounts").insertOne({
          tenantId: TENANT_ID,
          company_name: ca.name,
          name: ca.name, // Support both schemas
          industry: ca.ind,
          size: ca.size,
          annual_revenue: ca.rev,
          type: ca.type,
          status: "Active",
          owner_id: adminUserId,
          relationship_value: ca.rev,
          lifetime_value: ca.rev,
          account_health_score: ca.health,
          segment: "Strategic",
          tags: ["Enterprise", "High-Priority"],
          isDemo: true,
          source: SEED_SOURCE,
          createdBy: adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        crmAccIds.push(res.insertedId);
      } else {
        await db.collection("crmaccounts").updateOne(
          { _id: acc._id },
          { $set: { company_name: ca.name, name: ca.name, status: "Active", account_health_score: ca.health } }
        );
        crmAccIds.push(acc._id);
      }
    }
    console.log(`CRM accounts verified: ${crmAccIds.length} accounts.`);

    // 4.2 CRM Contacts (models/crm/Contact.ts)
    const contactDefs = [
      { first: "Rajiv", last: "Malhotra", email: "rajiv.m@tatasteel.demo", phone: "+919820011001", desig: "Chief Procurement Officer", role: "Decision Maker", acc: 0 },
      { first: "Sneha", last: "Kapoor", email: "sneha.k@tatasteel.demo", phone: "+919820011002", desig: "ERP Systems Architect", role: "Technical Contact", acc: 0 },
      { first: "Sunil", last: "Mittal", email: "sunil.m@jio.demo", phone: "+919820011003", desig: "Vice President Telecommunications", role: "Decision Maker", acc: 1 },
      { first: "Ananya", last: "Das", email: "ananya.d@jio.demo", phone: "+919820011004", desig: "Cloud Infrastructure Lead", role: "Influencer", acc: 1 },
      { first: "Kiran", last: "Mazumdar", email: "kiran.m@infosys.demo", phone: "+919820011005", desig: "Senior Director IT Solutions", role: "Executive Sponsor", acc: 2 },
      { first: "Vikram", last: "Deshmukh", email: "vikram.d@lntecc.demo", phone: "+919820011006", desig: "Head of Project Engineering", role: "Decision Maker", acc: 3 },
      { first: "Pooja", last: "Patel", email: "pooja.p@bajajauto.demo", phone: "+919820011007", desig: "Director Supply Chain", role: "Decision Maker", acc: 4 },
      { first: "Arjun", last: "Reddy", email: "arjun.r@mahindra.demo", phone: "+919820011008", desig: "Logistics Optimization Lead", role: "End User", acc: 5 },
    ];
    const crmContactIds: ObjectId[] = [];
    for (const ct of contactDefs) {
      let contact = await db.collection("crmcontacts").findOne({ tenantId: TENANT_ID, email: ct.email });
      if (!contact) {
        const res = await db.collection("crmcontacts").insertOne({
          tenantId: TENANT_ID,
          first_name: ct.first,
          last_name: ct.last,
          designation: ct.desig,
          email: ct.email,
          mobile: ct.phone,
          department: "Executive Management",
          role_in_buying: ct.role,
          preferred_communication: "Email",
          account_id: crmAccIds[ct.acc],
          is_primary: ct.role === "Decision Maker",
          is_decision_maker: ct.role === "Decision Maker",
          opt_in_status: true,
          tags: ["VIP", "Executive"],
          createdBy: adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        crmContactIds.push(res.insertedId);
      } else {
        crmContactIds.push(contact._id);
      }
    }
    console.log(`CRM contacts verified: ${crmContactIds.length} contacts.`);

    // 4.3 CRM Leads (models/crm/Lead.ts)
    const leadDefs = [
      { name: "Anil Ambani", company: "Reliance Communications", email: "anil@rcom.demo", status: "Qualified", score: 88, source: "Direct Website", budget: "₹50,00,000 - ₹1,00,00,000" },
      { name: "Gautam Adani", company: "Adani Green Solutions", email: "gautam@adanigreen.demo", status: "Qualified", score: 92, source: "Event", budget: "₹1,00,00,000+" },
      { name: "Anand Mahindra", company: "Mahindra Defence Logistics", email: "anand@mahindra.demo", status: "Attempting Contact", score: 65, source: "Website Form", budget: "₹25,00,000 - ₹50,00,000" },
      { name: "Natarajan Chandrasekaran", company: "Tata Sons Capital", email: "chandra@tata.demo", status: "Qualified", score: 95, source: "Partner Channel", budget: "₹1,00,00,000+" },
      { name: "Sanjiv Bajaj", company: "Bajaj Finserv Asset Hub", email: "sanjiv@bajajfinserv.demo", status: "Connected", score: 70, source: "Social Media", budget: "₹50,00,000 - ₹75,00,000" },
      { name: "Harsh Goenka", company: "RPG Enterprises Tech", email: "harsh@rpg.demo", status: "New", score: 50, source: "Direct Website", budget: "₹15,00,000 - ₹25,00,000" },
      { name: "Cyrus Mistry", company: "Shapoorji Pallonji EPC", email: "cyrus@shapoorji.demo", status: "Attempting Contact", score: 55, source: "Outbound Calling", budget: "₹50,00,000 - ₹1,00,00,000" },
      { name: "Pawan Munjal", company: "Hero MotoCorp Logistics", email: "pawan@heromoto.demo", status: "Connected", score: 80, source: "Event", budget: "₹50,00,000 - ₹1,00,00,000" },
      { name: "Suresh Narayanan", company: "Nestle India Supply Chain", email: "suresh@nestle.demo", status: "Qualified", score: 87, source: "Referral", budget: "₹75,00,000 - ₹1,50,00,000" },
      { name: "Sanjiv Mehta", company: "Hindustan Unilever Distribution", email: "mehta@hul.demo", status: "Connected", score: 84, source: "Partner Channel", budget: "₹1,00,00,000+" },
    ];
    for (let ld = 0; ld < 25; ld++) {
      const proto = leadDefs[ld % leadDefs.length];
      const leadName = ld < 10 ? proto.name : `${proto.name} (Unit ${ld + 1})`;
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
            budget_range: proto.budget,
            lead_score: proto.score - (ld % 10),
            tags: ["Enterprise", "ERP-Modernization"],
            isDemo: true,
            sourceDetail: SEED_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - (ld * 2) * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("CRM leads verified: 25 leads.");

    // 4.4 CRM Opportunities (models/crm/Opportunity.ts: deal_name, amount, stage, probability, account_id, owner_id)
    const oppStages = ["Prospecting", "Discovery", "Requirement Gathering", "Proposal Sent", "Negotiation", "Closed Won"];
    const crmOppIds: ObjectId[] = [];
    for (let op = 1; op <= 18; op++) {
      const acc = crmAccDefs[op % crmAccDefs.length];
      const oppName = `Enterprise Modernization Deal #${op} - ${acc.name.split(" ")[0]}`;
      const stage = oppStages[op % oppStages.length];
      const amt = 1500000 + op * 650000;
      const prob = stage === "Closed Won" ? 100 : (stage === "Negotiation" ? 80 : (stage === "Proposal Sent" ? 60 : 35));

      const oppRes = await db.collection("crmopportunities").findOneAndUpdate(
        { tenantId: TENANT_ID, $or: [{ deal_name: oppName }, { opportunity_name: oppName }] },
        {
          $set: {
            tenantId: TENANT_ID,
            deal_name: oppName,
            opportunity_name: oppName, // Support both schemas
            amount: amt,
            deal_size: amt,
            stage,
            probability: prob,
            weighted_value: Math.round(amt * (prob / 100)),
            expected_close_date: new Date(Date.now() + op * 7 * 86400000),
            account_id: crmAccIds[op % crmAccIds.length],
            contact_ids: crmContactIds.length > 0 ? [crmContactIds[op % crmContactIds.length]] : [],
            owner_id: adminUserId,
            is_at_risk: op % 5 === 0,
            priority: op % 2 === 0 ? "High" : "Medium",
            stage_entered_at: new Date(Date.now() - op * 2 * 86400000),
            isDemo: true,
            source: SEED_SOURCE,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - op * 4 * 86400000) },
        },
        { upsert: true, returnDocument: "after" }
      );
      if (oppRes?._id) crmOppIds.push(oppRes._id);
    }
    console.log(`CRM opportunities verified: ${crmOppIds.length} opportunities.`);

    // 4.5 CRM Activities (models/crm/Activity.ts)
    const actTypes = ["Call", "Meeting", "Email", "Quote Sent", "Proposal Discussed"];
    for (let ac = 1; ac <= 35; ac++) {
      const subj = `${actTypes[ac % actTypes.length]} - Stakeholder Technical Sync #${ac}`;
      await db.collection("crmactivities").updateOne(
        { tenantId: TENANT_ID, subject: subj },
        {
          $set: {
            tenantId: TENANT_ID,
            type: actTypes[ac % actTypes.length],
            subject: subj,
            description: "Detailed architecture review, multi-warehouse integrations, GST automation checklist.",
            performed_by_id: adminUserId,
            activity_date: new Date(Date.now() - ac * 86400000),
            outcome: "Action items documented and mutual milestones agreed upon.",
            linked_account_id: crmAccIds[ac % crmAccIds.length],
            linked_opportunity_id: crmOppIds.length > 0 ? crmOppIds[ac % crmOppIds.length] : undefined,
            isDemo: true,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - ac * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("CRM activities verified: 35 activities.");

    // 4.6 CRM Tasks (models/crm/Task.ts)
    const taskCategories = ["Follow Up", "Schedule Demo", "Send Proposal", "Prepare Meeting", "Call Back", "Renew Contract"];
    for (let tk = 1; tk <= 25; tk++) {
      const title = `${taskCategories[tk % taskCategories.length]} with ${crmAccDefs[tk % crmAccDefs.length].name.split(" ")[0]}`;
      await db.collection("crmtasks").updateOne(
        { tenantId: TENANT_ID, title },
        {
          $set: {
            tenantId: TENANT_ID,
            title,
            category: taskCategories[tk % taskCategories.length],
            description: "Follow up on enterprise pricing approval, legal compliance, and technical sign-off.",
            assigned_to_id: adminUserId,
            due_date: new Date(Date.now() + tk * 2 * 86400000),
            priority: tk % 3 === 0 ? "High" : (tk % 5 === 0 ? "Urgent" : "Medium"),
            status: tk % 4 === 0 ? "Completed" : "Pending",
            linked_account_id: crmAccIds[tk % crmAccIds.length],
            linked_opportunity_id: crmOppIds.length > 0 ? crmOppIds[tk % crmOppIds.length] : undefined,
            isDemo: true,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - tk * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("CRM tasks verified: 25 tasks.");

    // 4.7 CRM Cases (models/crm/Case.ts: case_number, title, account_id, owner_id, severity, status)
    const caseSeverities = ["Low", "Medium", "High", "Critical"];
    const caseStatuses = ["New", "Open", "In Progress", "Waiting on Customer", "Resolved", "Closed"];
    for (let cs = 1; cs <= 10; cs++) {
      const cNum = `CASE-2026-${String(cs).padStart(4, "0")}`;
      await db.collection("crmcases").updateOne(
        { tenantId: TENANT_ID, case_number: cNum },
        {
          $set: {
            tenantId: TENANT_ID,
            case_number: cNum,
            title: `Portal Telemetry Sync & Webhook Latency Check #${cs}`,
            description: "High volume of events queued during night batch settlement; verified queue latency.",
            account_id: crmAccIds[cs % crmAccIds.length],
            contact_id: crmContactIds.length > 0 ? crmContactIds[cs % crmContactIds.length] : undefined,
            owner_id: adminUserId,
            category: "Integration",
            severity: caseSeverities[cs % caseSeverities.length],
            status: caseStatuses[cs % caseStatuses.length],
            sla_target_at: new Date(Date.now() + 24 * 3600000),
            sla_breached: false,
            escalation_level: 0,
            resolution_summary: cs % 2 === 0 ? "Worker threads scaled up; backlog drained in under 2 minutes." : undefined,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - cs * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("CRM support cases verified: 10 cases.");

    // 4.8 CRM Quotes (models/crm/Quote.ts)
    const crmQuoteStatuses = ["Draft", "Pending Approval", "Approved", "Sent", "Accepted", "Expired"];
    for (let cq = 1; cq <= 8; cq++) {
      const qNum = `CRM-QT-2026-${String(cq).padStart(4, "0")}`;
      const baseVal = 250000 + cq * 80000;
      const tax = Math.round(baseVal * 0.18);
      await db.collection("crmquotes").updateOne(
        { tenantId: TENANT_ID, quote_number: qNum },
        {
          $set: {
            tenantId: TENANT_ID,
            quote_number: qNum,
            opportunity_id: crmOppIds[cq % crmOppIds.length],
            account_id: crmAccIds[cq % crmAccIds.length],
            owner_id: adminUserId,
            status: crmQuoteStatuses[cq % crmQuoteStatuses.length],
            validity_date: new Date(Date.now() + (30 - cq) * 86400000),
            version: 1,
            line_items: [
              {
                item_name: "Enterprise Multi-Site Cloud ERP Core",
                description: "Complete ERP core licensing with unlimited concurrent users.",
                quantity: 1,
                unit_price: baseVal,
                discount_percent: 5,
                tax_percent: 18,
                line_total: Math.round(baseVal * 0.95),
              },
            ],
            discount_total: Math.round(baseVal * 0.05),
            tax_total: tax,
            grand_total: Math.round(baseVal * 0.95) + tax,
            terms_and_conditions: "Standard 30-day payment term upon invoice issuance.",
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - cq * 3 * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("CRM quotes verified: 8 quotes.");

    // 4.9 CRM Contracts (models/crm/Contract.ts)
    const contractStatuses = ["Active", "Renewal Due", "Pending Signature", "Renewed"];
    for (let ct = 1; ct <= 8; ct++) {
      const cNum = `CTR-2026-${String(ct).padStart(4, "0")}`;
      await db.collection("crmcontracts").updateOne(
        { tenantId: TENANT_ID, contract_number: cNum },
        {
          $set: {
            tenantId: TENANT_ID,
            contract_number: cNum,
            account_id: crmAccIds[ct % crmAccIds.length],
            opportunity_id: crmOppIds.length > 0 ? crmOppIds[ct % crmOppIds.length] : undefined,
            owner_id: adminUserId,
            status: contractStatuses[ct % contractStatuses.length],
            start_date: new Date("2026-01-01"),
            end_date: new Date("2026-12-31"),
            renewal_date: new Date("2026-11-30"),
            contract_value: 1200000 + ct * 450000,
            billing_frequency: "Annual",
            auto_renew: true,
            churn_risk: ct % 4 === 0 ? "Medium" : "Low",
            renewal_status: "In Progress",
            reminder_90_sent: true,
            reminder_60_sent: true,
            reminder_30_sent: false,
            reminder_7_sent: false,
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date("2026-01-01") },
        },
        { upsert: true }
      );
    }
    console.log("CRM contracts verified: 8 contracts.");

    // 4.10 Marketing Campaigns (models/crm/Campaign.ts)
    const campaignDefs = [
      { code: "CMP-2026-Q4-ERP", name: "Q4 Enterprise ERP Modernization Drive", chan: "LinkedIn", budget: 450000, leads: 120, expRev: 4500000, actRev: 3800000 },
      { code: "CMP-2026-AUTO-EXPO", name: "Auto Expo 2026 Manufacturing Pavilion", chan: "Trade Show", budget: 850000, leads: 250, expRev: 8500000, actRev: 7200000 },
      { code: "CMP-2026-GST-AUTOM", name: "GST 2.0 & Automated Compliance Webinar", chan: "Paid Search", budget: 150000, leads: 90, expRev: 1800000, actRev: 1950000 },
      { code: "CMP-2026-PARTNER-SUM", name: "National Partner & CA Summit Mumbai", chan: "Event", budget: 350000, leads: 80, expRev: 3500000, actRev: 3100000 },
      { code: "CMP-2026-SOLAR-OUT", name: "Clean Tech & Solar Inverter Campaign", chan: "Direct Website", budget: 200000, leads: 75, expRev: 2500000, actRev: 2800000 },
      { code: "CMP-2026-WHATSAPP", name: "Instant Quote WhatsApp Connect Campaign", chan: "WhatsApp", budget: 95000, leads: 150, expRev: 1200000, actRev: 1400000 },
    ];
    for (const c of campaignDefs) {
      await db.collection("crmcampaigns").updateOne(
        { tenantId: TENANT_ID, campaign_code: c.code },
        {
          $set: {
            tenantId: TENANT_ID,
            campaign_name: c.name,
            campaign_code: c.code,
            owner_id: adminUserId,
            channel: c.chan,
            status: "Active",
            budget: c.budget,
            target_audience: "CTOs, CFOs, Operations Heads of mid-to-large Indian industrial enterprises.",
            start_date: new Date("2026-09-01"),
            end_date: new Date("2026-12-31"),
            expected_leads: c.leads,
            expected_revenue: c.expRev,
            attributed_revenue: c.actRev,
            actual_revenue: c.actRev,
            roi_percentage: Math.round(((c.actRev - c.budget) / c.budget) * 100),
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date("2026-09-01") },
        },
        { upsert: true }
      );
    }
    console.log("Marketing campaigns verified: 6 campaigns.");

    // 4.11 Field Visits (models/crm/FieldVisit.ts)
    for (let fv = 1; fv <= 8; fv++) {
      const accId = crmAccIds[fv % crmAccIds.length];
      await db.collection("crmfieldvisits").updateOne(
        { tenantId: TENANT_ID, recordId: accId, visit_notes: `Onsite ERP Workshop & Infrastructure Audit #${fv}` },
        {
          $set: {
            tenantId: TENANT_ID,
            recordType: "Account",
            recordId: accId,
            latitude: 19.0760 + fv * 0.01,
            longitude: 72.8777 + fv * 0.01,
            address: "Plant Facilities & Warehouse Floor",
            visit_start: new Date(Date.now() - fv * 2 * 86400000),
            visit_end: new Date(Date.now() - fv * 2 * 86400000 + 7200000),
            duration: 120,
            visit_notes: `Onsite ERP Workshop & Infrastructure Audit #${fv}`,
            customer_feedback: "Very impressed with sub-second barcode scans and live trial balance generation.",
            status: "Checked Out",
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - fv * 2 * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Field visits verified: 8 visits.");

    // 4.12 Customer Communications (models/crm/Communication.ts)
    const commChannels = ["Email", "WhatsApp", "Phone Call", "Meeting Note"];
    for (let cm = 1; cm <= 15; cm++) {
      const accId = crmAccIds[cm % crmAccIds.length];
      await db.collection("crmcommunications").updateOne(
        { tenantId: TENANT_ID, subject: `Automated Project Milestones Notification #${cm}` },
        {
          $set: {
            tenantId: TENANT_ID,
            recordType: "Account",
            recordId: accId,
            channel: commChannels[cm % commChannels.length],
            direction: cm % 2 === 0 ? "outbound" : "inbound",
            subject: `Automated Project Milestones Notification #${cm}`,
            message: "Quarterly deployment summary and SLA health status delivered to executive sponsor.",
            attachments: [],
            sender: "admin@aupulens.com",
            recipient: "procurement@client.demo",
            status: "Delivered",
            sentAt: new Date(Date.now() - cm * 86400000),
            deliveredAt: new Date(Date.now() - cm * 86400000 + 60000),
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - cm * 86400000) },
        },
        { upsert: true }
      );
    }
    console.log("Communications verified: 15 communications.");

    // 4.13 Customer Onboarding Plans (models/crm/OnboardingPlan.ts)
    for (let ob = 1; ob <= 4; ob++) {
      const accId = crmAccIds[ob % crmAccIds.length];
      await db.collection("crmonboardingplans").updateOne(
        { tenantId: TENANT_ID, account_id: accId },
        {
          $set: {
            tenantId: TENANT_ID,
            account_id: accId,
            opportunity_id: crmOppIds.length > 0 ? crmOppIds[ob % crmOppIds.length] : undefined,
            owner_id: adminUserId,
            status: ob === 1 ? "In Progress" : (ob === 2 ? "Go Live" : "Training"),
            progress: ob * 25,
            kickoff_date: new Date(Date.now() - 30 * 86400000),
            go_live_date: new Date(Date.now() + 15 * 86400000),
            milestones: [
              { title: "Master Data Extraction & Chart of Accounts Import", status: "Completed", dueDate: new Date(Date.now() - 20 * 86400000) },
              { title: "Multi-Warehouse Location Hierarchy & Stock Opening Balances", status: "Completed", dueDate: new Date(Date.now() - 10 * 86400000) },
              { title: "NIC E-Invoice & E-Waybill API Handshake", status: "In Progress", dueDate: new Date(Date.now() + 5 * 86400000) },
              { title: "Departmental Role-Based Access & User Training", status: "Pending", dueDate: new Date(Date.now() + 15 * 86400000) },
            ],
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Onboarding plans verified: 4 plans.");

    // 4.14 In-App Notifications (models/crm/Notification.ts)
    const notifDefs = [
      { title: "High-Value Opportunity Moved to Negotiation", msg: "Tata Steel deal #1 has advanced to Negotiation stage with 80% probability." },
      { title: "SLA Alert: Critical Support Ticket Escalation", msg: "Ticket CASE-2026-0004 resolved within statutory 1-hour enterprise SLA." },
      { title: "Contract Renewal Approaching in 30 Days", msg: "Reliance Jio Annual AMC CTR-2026-0002 is due for automated renewal review." },
      { title: "New Qualified Inbound Enterprise Lead", msg: "Adani Green Solutions submitted a request for multi-plant manufacturing demo." },
      { title: "Quarterly Balanced Journal Validation Success", msg: "7 GL journals verified with 0 discrepancy between debit and credit ledgers." },
    ];
    for (let nt = 0; nt < notifDefs.length; nt++) {
      const n = notifDefs[nt];
      await db.collection("crmnotifications").updateOne(
        { tenantId: TENANT_ID, title: n.title },
        {
          $set: {
            tenantId: TENANT_ID,
            userId: adminUserId,
            type: "EnterpriseAlert",
            title: n.title,
            message: n.msg,
            isRead: nt > 2,
            actionUrl: "/crm/dashboard",
            deliveryMethod: "InApp",
            status: "Delivered",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(Date.now() - nt * 3600000) },
        },
        { upsert: true }
      );
    }
    console.log("Notifications verified: 5 notifications.");

    // 4.15 Automation Rules (models/crm/AutomationRule.ts)
    const autoRules = [
      { name: "Auto Assign Leads to Regional Sales Director", trigger: "record_created", entity: "Lead" },
      { name: "Trigger High-Value Deal Win Celebration & Task", trigger: "stage_changed", entity: "Opportunity" },
      { name: "Auto Create Renewal Opportunity 60 Days Prior", trigger: "contract_expiring", entity: "Contract" },
    ];
    for (const ar of autoRules) {
      await db.collection("crmautomationrules").updateOne(
        { tenantId: TENANT_ID, name: ar.name },
        {
          $set: {
            tenantId: TENANT_ID,
            name: ar.name,
            description: "Automated trigger driving workflow velocity and SLA compliance.",
            trigger: ar.trigger,
            entity: ar.entity,
            conditions: [{ field: "status", operator: "equals", value: "Active" }],
            actions: [{ type: "send_notification", payload: { channel: "InApp" } }],
            enabled: true,
            executionCount: 142,
            lastExecutedAt: new Date(),
            createdBy: adminUserId,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
    console.log("Automation rules verified: 3 rules.");

    // ─────────────────────────────────────────────────────────────
    // 5. VERIFY SYSTEM INTEGRITY & RECORD COUNTS
    // ─────────────────────────────────────────────────────────────
    console.log("\n=======================================================");
    console.log("VERIFYING FINAL DOCUMENT COUNTS FOR default-tenant:");
    console.log("=======================================================");

    const checkCollections = [
      "customers",
      "salesquotations",
      "saleorders",
      "salesinvoices",
      "deliverychallans",
      "payments",
      "subscriptions",
      "pricelists",
      "accounts",
      "bankaccounts",
      "vendors",
      "invoices",
      "purchaseorders",
      "expenses",
      "assets",
      "journalentries",
      "bankstatements",
      "budgets",
      "bankingrules",
      "periodclosings",
      "items",
      "itemboms",
      "billofmaterials",
      "manufacturingorders",
      "shipments",
      "airfreights",
      "customsclearances",
      "freightproviders",
      "hscodes",
      "coupons",
      "crmaccounts",
      "crmcontacts",
      "crmleads",
      "crmopportunities",
      "crmactivities",
      "crmtasks",
      "crmcases",
      "crmquotes",
      "crmcontracts",
      "crmcampaigns",
      "crmfieldvisits",
      "crmcommunications",
      "crmonboardingplans",
      "crmnotifications",
      "crmautomationrules",
      "users",
      "organizations",
      "organizationentitlements",
    ];

    const report: Record<string, number> = {};
    for (const c of checkCollections) {
      if (c === "organizations") {
        report[c] = await db.collection(c).countDocuments({ subdomain: TENANT_ID });
      } else {
        report[c] = await db.collection(c).countDocuments({ tenantId: TENANT_ID });
      }
    }
    console.log(JSON.stringify(report, null, 2));

    console.log("\n=======================================================");
    console.log("ALL DATA SEEDING & ADMIN MODULE ENABLING COMPLETE!");
    console.log(`admin@aupulens.com has Enterprise access to ALL modules:`);
    console.log(ALL_MODULES.join(", "));
    console.log("=======================================================\n");

  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Master Seeder Error:", err);
  process.exit(1);
});
