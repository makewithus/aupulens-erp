import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
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

/**
 * Universal Enterprise Search (Phase 6.1) — extends the CRM-only search
 * (app/api/crm/search) to genuinely cover Sales, Inventory, HR, and Projects
 * as well, so the app-wide header search box (components/dashboard/GlobalSearch)
 * actually queries records across modules instead of only fuzzy-filtering the
 * sidebar menu.
 *
 * Results are role-scoped: admin/master-admin see everything; a module role
 * only searches the entities it can access, so search never leaks records a
 * user couldn't otherwise open. (The linked pages are middleware-gated too,
 * so this is defense-in-depth, not the only check.)
 */
type SearchResult = { type: string; id: string; title: string; subtitle?: string; badge?: string; url: string };

export async function GET(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const role = ((session!.user as any).role || "").toLowerCase();

  await dbConnect();
  const term = new URL(req.url).searchParams.get("q");
  if (!term || term.length < 2) return NextResponse.json({ success: true, data: [] });

  const regex = new RegExp(escapeRegex(term), "i");
  const isAdmin = role === "admin" || role === "master-admin";
  const can = (module: string) => isAdmin || role === module;

  const tasks: Promise<SearchResult[]>[] = [];

  if (can("sales") || isAdmin) {
    tasks.push(
      (SalesInvoice as any).find({ tenantId, number: regex }).select("number status").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Invoice", id: String(r._id), title: r.number, badge: r.status, url: `/sales/invoices/${r._id}` }))),
      (Customer as any).find({ tenantId, $or: [{ "name": regex }, { "displayName": regex }, { "companyName": regex }] }).select("name displayName").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Customer", id: String(r._id), title: r.displayName || r.name, url: `/sales/customers/${r._id}` }))),
      (SaleOrder as any).find({ tenantId, name: regex }).select("name status").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Sale Order", id: String(r._id), title: r.name, badge: r.status, url: `/sales/orders/${r._id}` }))),
    );
  }

  if (can("sales")) {
    // CRM shares the sales role in this app (see middleware).
    tasks.push(
      CrmLead.find({ tenantId, $or: [{ lead_name: regex }, { company_name: regex }, { email: regex }] }).select("lead_name company_name status").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Lead", id: String(r._id), title: r.lead_name, subtitle: r.company_name, badge: r.status, url: `/crm/leads/${r._id}` }))),
      CrmAccount.find({ tenantId, company_name: regex }).select("company_name industry").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Account", id: String(r._id), title: r.company_name, subtitle: r.industry, url: `/crm/accounts/${r._id}` }))),
      CrmContact.find({ tenantId, $or: [{ first_name: regex }, { last_name: regex }, { email: regex }] }).select("first_name last_name email").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Contact", id: String(r._id), title: `${r.first_name} ${r.last_name}`, subtitle: r.email, url: `/crm/contacts/${r._id}` }))),
      CrmOpportunity.find({ tenantId, deal_name: regex }).select("deal_name stage").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Opportunity", id: String(r._id), title: r.deal_name, badge: r.stage, url: `/crm/opportunities/${r._id}` }))),
    );
  }

  if (can("inventory")) {
    tasks.push(
      (InventoryItem as any).find({ tenantId, $or: [{ name: regex }, { itemCode: regex }] }).select("name itemCode").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Inventory Item", id: String(r._id), title: r.name, subtitle: r.itemCode, url: `/inventory/stock` }))),
    );
  }

  if (can("hr")) {
    tasks.push(
      Employee.find({ tenantId, $or: [{ firstName: regex }, { lastName: regex }, { email: regex }, { employeeCode: regex }] }).select("firstName lastName employeeCode").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Employee", id: String(r._id), title: `${r.firstName} ${r.lastName}`, subtitle: r.employeeCode, url: `/hr/employees` }))),
    );
  }

  if (can("project")) {
    tasks.push(
      Project.find({ tenantId, name: regex }).select("name status").limit(5).lean()
        .then((rows: any[]) => rows.map((r) => ({ type: "Project", id: String(r._id), title: r.name, badge: r.status, url: `/projects/${r._id}` }))),
    );
  }

  const settled = await Promise.all(tasks.map((p) => p.catch(() => [] as SearchResult[])));
  const results = settled.flat();

  return NextResponse.json({ success: true, data: results });
}
