/**
 * Shared Universal Enterprise Search (Phase 6.1, extracted in Scope B so the
 * AI Command Center's "search data" intent runs the SAME real cross-module,
 * role-scoped query as the header search box — one implementation, not two.
 *
 * Semantic ranking (embeddings) is layered ON TOP of this in Scope G; this
 * module remains the keyword/regex baseline and the fallback.
 */
import dbConnect from "@/lib/db";
import { escapeRegex } from "@/lib/utils/regex";
import CrmLead from "@/models/crm/Lead";
import CrmAccount from "@/models/crm/Account";
import CrmContact from "@/models/crm/Contact";
import CrmOpportunity from "@/models/crm/Opportunity";
import { SalesInvoice } from "@/models/SalesInvoice";
import Customer from "@/models/Customer";
import SaleOrder from "@/models/SaleOrder";
import InventoryItem from "@/models/InventoryItem";
import Employee from "@/models/Employee";
import Project from "@/models/Project";

export type SearchResult = { type: string; id: string; title: string; subtitle?: string; badge?: string; url: string };

/**
 * Role-scoped keyword search across CRM, Sales, Inventory, HR and Projects.
 * admin/master-admin see everything; a module role only searches entities it
 * can access, so search never leaks records the user couldn't open.
 */
export async function runUniversalSearch(tenantId: string, role: string, term: string): Promise<SearchResult[]> {
  await dbConnect();
  if (!term || term.length < 2) return [];

  const r = (role || "").toLowerCase();
  const regex = new RegExp(escapeRegex(term), "i");
  const isAdmin = r === "admin" || r === "master-admin";
  const can = (module: string) => isAdmin || r === module;

  const tasks: Promise<SearchResult[]>[] = [];

  if (can("sales") || isAdmin) {
    tasks.push(
      (SalesInvoice as any).find({ tenantId, number: regex }).select("number status").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Invoice", id: String(x._id), title: x.number, badge: x.status, url: `/sales/invoices/${x._id}` }))),
      (Customer as any).find({ tenantId, $or: [{ name: regex }, { displayName: regex }, { companyName: regex }] }).select("name displayName").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Customer", id: String(x._id), title: x.displayName || x.name, url: `/sales/customers/${x._id}` }))),
      (SaleOrder as any).find({ tenantId, name: regex }).select("name status").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Sale Order", id: String(x._id), title: x.name, badge: x.status, url: `/sales/orders/${x._id}` }))),
    );
  }

  if (can("sales")) {
    // CRM shares the sales role in this app (see middleware).
    tasks.push(
      CrmLead.find({ tenantId, $or: [{ lead_name: regex }, { company_name: regex }, { email: regex }] }).select("lead_name company_name status").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Lead", id: String(x._id), title: x.lead_name, subtitle: x.company_name, badge: x.status, url: `/crm/leads/${x._id}` }))),
      CrmAccount.find({ tenantId, company_name: regex }).select("company_name industry").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Account", id: String(x._id), title: x.company_name, subtitle: x.industry, url: `/crm/accounts/${x._id}` }))),
      CrmContact.find({ tenantId, $or: [{ first_name: regex }, { last_name: regex }, { email: regex }] }).select("first_name last_name email").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Contact", id: String(x._id), title: `${x.first_name} ${x.last_name}`, subtitle: x.email, url: `/crm/contacts/${x._id}` }))),
      CrmOpportunity.find({ tenantId, deal_name: regex }).select("deal_name stage").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Opportunity", id: String(x._id), title: x.deal_name, badge: x.stage, url: `/crm/opportunities/${x._id}` }))),
    );
  }

  if (can("inventory")) {
    tasks.push(
      (InventoryItem as any).find({ tenantId, $or: [{ name: regex }, { itemCode: regex }] }).select("name itemCode").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Inventory Item", id: String(x._id), title: x.name, subtitle: x.itemCode, url: `/inventory/stock` }))),
    );
  }

  if (can("hr")) {
    tasks.push(
      Employee.find({ tenantId, $or: [{ firstName: regex }, { lastName: regex }, { email: regex }, { employeeCode: regex }] }).select("firstName lastName employeeCode").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Employee", id: String(x._id), title: `${x.firstName} ${x.lastName}`, subtitle: x.employeeCode, url: `/hr/employees` }))),
    );
  }

  if (can("project")) {
    tasks.push(
      Project.find({ tenantId, name: regex }).select("name status").limit(5).lean()
        .then((rows: any[]) => rows.map((x) => ({ type: "Project", id: String(x._id), title: x.name, badge: x.status, url: `/projects/${x._id}` }))),
    );
  }

  const settled = await Promise.all(tasks.map((p) => p.catch(() => [] as SearchResult[])));
  return settled.flat();
}
