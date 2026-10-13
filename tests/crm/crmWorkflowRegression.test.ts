import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_crm_regression";

import CrmLead from "@/models/crm/Lead";
import CrmAccount from "@/models/crm/Account";
import CrmContact from "@/models/crm/Contact";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAuditLog from "@/models/CrmAuditLog";
import { isValidOpportunityTransition, normalizeProbability, OPPORTUNITY_STAGE } from "@/lib/crm/workflow";
import { applicableSteps, getApprovalTier } from "@/lib/crm/approvalEngine";
import { generateQuotePdf } from "@/lib/crm/pdfGenerator";
import { lookupHsnSac, findHsnSacReference } from "@/lib/tax/hsnData";
import { comparePurchaseLineTax } from "@/lib/tax/purchaseTaxCompare";
import { buildGstReport } from "@/lib/tax/gstReport";
import { hasPermission, requireRole } from "@/lib/crm/rbac";
import Customer from "@/models/sales/Customer";
import SalesQuotation from "@/models/sales/SalesQuotation";
import SaleOrder from "@/models/sales/SaleOrder";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import JournalEntry from "@/models/finance/JournalEntry";
import { convertQuoteToInvoice } from "@/lib/sales/quoteInvoice";

const TENANT_A = "tenant-crm-workflow-a";
const TENANT_B = "tenant-crm-workflow-b";
const USER_A = new mongoose.Types.ObjectId();
const USER_A_STR = String(USER_A);

describe("Comprehensive CRM Workflow Regression Suite (Priority 5)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      CrmLead.init(),
      CrmAccount.init(),
      CrmContact.init(),
      CrmOpportunity.init(),
      CrmAuditLog.init(),
      Customer.init(),
      SalesQuotation.init(),
      SaleOrder.init(),
      SalesInvoice.init(),
      JournalEntry.init(),
    ]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    // Note: CrmAuditLog has Mongoose immutability pre-hooks preventing Mongoose deleteMany.
    // Use native collection method to safely reset test tenant state.
    await CrmAuditLog.collection.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await Promise.all([
      CrmLead.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      CrmAccount.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      CrmContact.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      CrmOpportunity.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      Customer.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      SalesQuotation.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      SaleOrder.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      SalesInvoice.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
      JournalEntry.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } }),
    ]);
  });

  // 1. Lead creation, editing, and listing
  it("Workflow 1: Lead creation, update, and tenant-scoped listing", async () => {
    const lead = await CrmLead.create({
      tenantId: TENANT_A,
      lead_name: "Bruce Wayne",
      company_name: "Wayne Enterprises",
      email: "bruce@wayne.com",
      phone: "+1-555-0199",
      status: "New",
      owner_id: USER_A,
      createdBy: USER_A,
    });
    expect(lead._id).toBeDefined();
    expect(lead.status).toBe("New");

    // Update lead
    lead.status = "Attempting Contact";
    lead.notes = "Reached out via email";
    await lead.save();

    const fetched = await CrmLead.findOne({ _id: lead._id, tenantId: TENANT_A });
    expect(fetched?.status).toBe("Attempting Contact");
    expect(fetched?.notes).toBe("Reached out via email");

    // Tenant isolation: Tenant B cannot list or find lead
    const crossTenant = await CrmLead.findOne({ _id: lead._id, tenantId: TENANT_B });
    expect(crossTenant).toBeNull();
  });

  // 2. Lead conversion into Account, Contact, and Opportunity
  it("Workflow 2: Lead conversion creates linked Account, Contact, and Opportunity", async () => {
    const lead = await CrmLead.create({
      tenantId: TENANT_A,
      lead_name: "Diana Prince",
      company_name: "Themyscira Exports",
      email: "diana@themyscira.gov",
      phone: "+1-555-0188",
      status: "Qualified",
      owner_id: USER_A,
      createdBy: USER_A,
    });

    // Execute conversion logic
    const account = await CrmAccount.create({
      tenantId: TENANT_A,
      company_name: lead.company_name,
      owner_id: USER_A,
      createdBy: USER_A,
    });

    const contact = await CrmContact.create({
      tenantId: TENANT_A,
      first_name: "Diana",
      last_name: "Prince",
      email: lead.email,
      mobile: lead.phone,
      account_id: account._id,
      createdBy: USER_A,
    });

    const opportunity = await CrmOpportunity.create({
      tenantId: TENANT_A,
      deal_name: `${lead.company_name} Expansion`,
      account_id: account._id,
      contact_ids: [contact._id],
      lead_id: lead._id,
      stage: "Prospecting",
      owner_id: USER_A,
      createdBy: USER_A,
      stage_entered_at: new Date(),
    });

    lead.status = "Converted";
    lead.converted_at = new Date();
    lead.converted_account_id = account._id as any;
    lead.converted_contact_id = contact._id as any;
    lead.converted_opportunity_id = opportunity._id as any;
    await lead.save();

    const reloaded = await CrmLead.findById(lead._id);
    expect(reloaded?.status).toBe("Converted");
    expect(String(reloaded?.converted_account_id)).toBe(String(account._id));
    expect(String(reloaded?.converted_contact_id)).toBe(String(contact._id));
    expect(String(reloaded?.converted_opportunity_id)).toBe(String(opportunity._id));
  });

  // 3. Opportunity stage transitions and pipeline synchronization
  it("Workflow 3: Opportunity stage transitions and probability normalization", () => {
    expect(isValidOpportunityTransition(OPPORTUNITY_STAGE.QUALIFICATION, OPPORTUNITY_STAGE.PROPOSAL)).toBe(true);
    expect(isValidOpportunityTransition(OPPORTUNITY_STAGE.PROPOSAL, OPPORTUNITY_STAGE.WON)).toBe(true);
    expect(isValidOpportunityTransition(OPPORTUNITY_STAGE.WON, OPPORTUNITY_STAGE.QUALIFICATION)).toBe(false);

    expect(normalizeProbability(75)).toBe(75);
    expect(normalizeProbability(-5)).toBe(0);
    expect(normalizeProbability(125)).toBe(100);
  });

  // 4. CRM quotation creation, approval, and PDF generation
  it("Workflow 4: Quote approval chain routing and PDF generation", async () => {
    const steps = [
      { order: 1, approverRole: "Manager", minAvgDiscountPercent: 10 },
      { order: 2, approverRole: "Finance", minAmount: 50000 },
    ];

    // Low discount, small amount -> auto-approve
    expect(applicableSteps({ avgDiscountPercent: 2, totalAmount: 1000 }, steps)).toHaveLength(0);
    expect(getApprovalTier(3)).toBe("auto");
    expect(getApprovalTier(10)).toBe("manager");

    // Moderate discount -> Manager only
    const chain1 = applicableSteps({ avgDiscountPercent: 12, totalAmount: 1000 }, steps);
    expect(chain1.map((s) => s.approverRole)).toEqual(["Manager"]);

    // Test PDF generation
    const mockQuote = {
      quote_number: "QT-2026-001",
      title: "Enterprise Implementation",
      status: "Approved",
      issue_date: new Date(),
      expiry_date: new Date(Date.now() + 30 * 86400000),
      currency: "USD",
      subtotal: 50000,
      total_discount: 5000,
      tax_amount: 8100,
      grand_total: 53100,
      notes: "Payment due within 30 days",
      items: [
        {
          item_type: "product",
          name: "ERP Enterprise License",
          description: "Annual cloud subscription",
          quantity: 1,
          unit_price: 50000,
          discount_percent: 10,
          discount_amount: 5000,
          tax_percent: 18,
          tax_amount: 8100,
          total_price: 53100,
        },
      ],
    };

    const mockAccount = {
      company_name: "Wayne Enterprises",
      billing_address: "1007 Mountain Drive, Gotham City",
    };

    const pdfBytes = await generateQuotePdf(mockQuote as any, mockAccount as any);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    // PDF Magic Number header: %PDF
    const header = String.fromCharCode(...pdfBytes.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  // 5. Sales quotation creation and calculation
  it("Workflow 5: Sales quotation calculation and totals integrity", async () => {
    const cust = await Customer.create({
      tenantId: TENANT_A,
      header: { name: "Metropolis Tech", displayName: "Metropolis Tech" },
      createdBy: USER_A,
    });

    const quotation = await SalesQuotation.create({
      tenantId: TENANT_A,
      quoteNumber: "QUO-WF-001",
      customerId: cust._id,
      createdBy: USER_A,
      lineItems: [
        {
          name: "High Precision Lens",
          qty: 5,
          unitPrice: 2000,
          discount: 10,
          discountMode: "percent",
          taxRate: 18,
          lineTotal: 10620,
        },
      ],
      taxableAmount: 9000,
      totalDiscount: 1000,
      totalAmount: 10620,
      status: "draft",
    });

    expect(quotation._id).toBeDefined();
    expect(quotation.totalAmount).toBe(10620);
    expect(quotation.taxableAmount).toBe(9000);
  });

  // 6 & 7. Accepted Sales quotation conversion to order, invoice, and journal entry
  it("Workflow 6 & 7: Quote conversion, journal posting, and retry idempotency", async () => {
    const cust = await Customer.create({
      tenantId: TENANT_A,
      header: { name: "Star Labs", displayName: "Star Labs" },
      createdBy: USER_A,
    });

    const quote = await SalesQuotation.create({
      tenantId: TENANT_A,
      quoteNumber: "QUO-WF-002",
      customerId: cust._id,
      createdBy: USER_A,
      lineItems: [
        {
          name: "Sensor Array",
          qty: 2,
          unitPrice: 5000,
          discount: 0,
          discountMode: "percent",
          taxRate: 18,
          lineTotal: 11800,
        },
      ],
      taxableAmount: 10000,
      totalDiscount: 0,
      totalAmount: 11800,
      status: "accepted",
    });

    const invoice = await convertQuoteToInvoice({
      quote,
      tenantId: TENANT_A,
      userId: USER_A_STR,
    });

    expect(invoice._id).toBeDefined();
    expect(invoice.number).toBeDefined();
    expect(invoice.journalEntryIds?.length).toBeGreaterThan(0);

    // Idempotent retry: converting the same quotation again returns the existing invoice
    const retry = await convertQuoteToInvoice({
      quote: await SalesQuotation.findById(quote._id),
      tenantId: TENANT_A,
      userId: USER_A_STR,
    });

    expect(String(retry._id)).toBe(String(invoice._id));

    // Verify only one journal entry was created
    const journalCount = await JournalEntry.countDocuments({
      tenantId: TENANT_A,
      "header.ref": invoice.number,
    });
    expect(journalCount).toBe(1);
  });

  // 8. Product selection and HSN/SAC lookup using local service
  it("Workflow 8: HSN/SAC lookup using local service", () => {
    const found = findHsnSacReference("4820", "goods");
    expect(found).toBeDefined();
    expect(found?.code).toBe("4820");

    const descSearch = lookupHsnSac("Hard-cover ruled notebook for writing, 200 pages", "goods");
    expect(descSearch.selected?.code).toBe("4820");
    expect(descSearch.selected?.type).toBe("goods");
  });

  // 9. Purchase tax comparison
  it("Workflow 9: Purchase tax comparison against product master", () => {
    const product = {
      tab_general_information: {
        hsnSacCode: "4820",
        gstRate: 18,
        gstTreatment: "taxable",
      },
    };

    const match = comparePurchaseLineTax(
      { hsnSacCode: "4820", taxRate: 18, gstTreatment: "taxable" },
      product,
    );
    expect(match.status).toBe("matched");

    const mismatch = comparePurchaseLineTax(
      { hsnSacCode: "4819", taxRate: 12, gstTreatment: "taxable" },
      product,
    );
    expect(mismatch.status).toBe("mismatch");
    expect(mismatch.differences).toContain("HSN/SAC");
    expect(mismatch.differences).toContain("GST rate");
  });

  // 10. GST report generation using verified data
  it("Workflow 10: GST report generation and rate/treatment breakdown", () => {
    const report = buildGstReport([
      {
        lineItems: [
          { hsn: "4820", taxRate: 18, gstTreatment: "taxable", taxableValue: 1000, taxAmount: 180, lineTotal: 1180 },
          { hsn: "9983", taxRate: 18, gstTreatment: "taxable", taxableValue: 5000, taxAmount: 900, lineTotal: 5900 },
          { hsn: "", taxRate: 0, gstTreatment: "exempt", taxableValue: 200, taxAmount: 0, lineTotal: 200 },
        ],
      },
    ]);

    expect(report.length).toBeGreaterThanOrEqual(3);
    const item4820 = report.find((r) => r.hsn === "4820");
    expect(item4820?.taxableValue).toBe(1000);
    expect(item4820?.taxAmount).toBe(180);

    const missing = report.find((r) => r.hsn === "-");
    expect(missing?.missingHsnCount).toBe(1);
    expect(missing?.gstTreatment).toBe("exempt");
  });

  // 11. CRM permission checks and tenant isolation
  it("Workflow 11: CRM RBAC and role enforcement", () => {
    const adminSession = { user: { id: "u1", role: "admin" } };
    const salesSession = { user: { id: "u2", role: "sales" } };

    // Admin has write access
    expect(hasPermission(adminSession, "lead.delete")).toBe(true);
    expect(requireRole(adminSession, ["lead.delete"])).toBeNull();

    // Sales can read
    expect(hasPermission(salesSession, "lead.read")).toBe(true);
    expect(requireRole(salesSession, ["lead.read"])).toBeNull();

    // Sales cannot delete without override
    expect(hasPermission(salesSession, "lead.delete")).toBe(false);
    expect(requireRole(salesSession, ["lead.delete"])?.status).toBe(403);

    // Unauthenticated
    expect(requireRole(null, ["lead.read"])?.status).toBe(401);
  });

  // 12. Audit-log creation, retrieval, and immutability
  it("Workflow 12: CRM Audit Log creation, retrieval, and immutability", async () => {
    const log = await CrmAuditLog.create({
      tenantId: TENANT_A,
      user_id: USER_A,
      action: "converted",
      record_type: "Lead",
      record_id: new mongoose.Types.ObjectId(),
      new_value: "Converted to Account",
    });

    expect(log._id).toBeDefined();

    // Tenant A can query
    const found = await CrmAuditLog.find({ tenantId: TENANT_A });
    expect(found.length).toBe(1);
    expect(found[0].action).toBe("converted");

    // Tenant B cannot see Tenant A's audit log
    const tenantBLogs = await CrmAuditLog.find({ tenantId: TENANT_B });
    expect(tenantBLogs.length).toBe(0);

    // Immutability: update and delete operations must throw
    await expect(CrmAuditLog.updateOne({ _id: log._id }, { action: "updated" })).rejects.toThrow();
    await expect(CrmAuditLog.deleteOne({ _id: log._id })).rejects.toThrow();
  });
});
