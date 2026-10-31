import { z } from "zod";
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SalesQuotation from "@/models/sales/SalesQuotation";
import SaleOrder from "@/models/sales/SaleOrder";
import { issuedInvoiceFilter, unpaidInvoiceFilter, invoiceOutstandingExpression } from "@/lib/sales/invoiceEligibility";
import { getOnHandQuantity } from "@/lib/inventory/stockGuard";

export class ErpToolError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export const erpQuerySchema = z.object({
  entity: z.enum(["invoice", "customer", "quote", "sales_order", "product"]),
  operation: z.enum(["search", "count", "sum", "group", "lookup"]),
  identifier: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  customer: z.string().trim().min(1).max(160).optional(),
  status: z.enum(["issued", "unpaid", "overdue", "paid", "draft", "cancelled", "saved", "partially_paid"]).optional(),
  dateFrom: z.iso.datetime().optional(), dateTo: z.iso.datetime().optional(),
  amountMin: z.number().finite().nonnegative().optional(), amountMax: z.number().finite().nonnegative().optional(),
  sort: z.enum(["amount_desc", "amount_asc", "date_desc", "date_asc"]).default("date_desc"),
  limit: z.number().int().min(1).max(25).default(10), offset: z.number().int().min(0).max(10000).default(0),
}).strict();
export type ErpQuery = z.infer<typeof erpQuerySchema>;
export const currency = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const customerName = (c: any) => c?.header?.displayName || c?.header?.companyName || c?.header?.name || "Unnamed customer";
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const flexibleNameRegex = (s: string) => new RegExp(escapeRegex(s.trim()).replace(/\s+/g, "[\\s._-]+"), "i");
function tenantScope(tenantId: string) {
  return tenantId === "default" || tenantId === "default-tenant"
    ? { $in: ["default", "default-tenant"] }
    : tenantId;
}
function customerTenantFilter(tenantId: string) {
  // The built-in default workspace predates mandatory tenantId values. Keep
  // those legacy rows visible only in that workspace; never widen a named
  // tenant's customer lookup.
  return tenantId === "default" || tenantId === "default-tenant"
    ? { $or: [{ tenantId: tenantScope(tenantId) }, { tenantId: { $exists: false } }] }
    : { tenantId };
}
export function requireSalesAccess(role: string) {
  if (!["sales", "admin", "master-admin"].includes(role)) throw new ErpToolError("PERMISSION_DENIED", "You don't have permission to access Sales records.", 403);
}
export async function resolveCustomer(tenantId: string, name: string) {
  // Older/imported customer rows may keep the searchable name at the document
  // root. Include it alongside the current header fields so AI quote lookup
  // works for both legacy and current customer records.
  const fields = ["header.displayName", "header.companyName", "header.name", "name"];
  const search = (exact: boolean) => {
    const tenantFilter = customerTenantFilter(tenantId);
    if (exact) {
      return Customer.find({ $and: [tenantFilter, { $or: fields.map(field => ({ [field]: { $regex: `^${escapeRegex(name)}$`, $options: "i" } })) }] })
        .select("header name contact_details.email contact_details.mobile contact_details.phone").limit(6).maxTimeMS(5000).lean();
    }
    // Match each part of a person's name across the stored name fields. Some
    // imported contacts store first and last names separately, while others
    // keep the complete name in header.name or displayName.
    const words = name.trim().split(/\s+/).filter(Boolean);
    return Customer.find({
      $and: [
        tenantFilter,
        ...words.map(word => ({ $or: [...fields, "header.firstName", "header.lastName"].map(field => ({ [field]: { $regex: escapeRegex(word), $options: "i" } })) })),
      ],
    }).select("header name contact_details.email contact_details.mobile contact_details.phone").limit(6).maxTimeMS(5000).lean();
  };
  let matches = await search(true);
  if (!matches.length) matches = await search(false);
  if (!matches.length) throw new ErpToolError("NOT_FOUND", `No customer matching “${name}” was found in your accessible records.`, 404);
  if (matches.length !== 1) throw new ErpToolError("AMBIGUOUS_MATCH", `I found multiple matching customers. Which one do you mean? ${matches.map(customerName).join(", ")}`, 409);
  return matches[0];
}
const config = {
  invoice: { model: SalesInvoice, number: "number", date: "invoiceDate", amount: "totalAmount", projection: "number customerId invoiceDate dueDate totalAmount status markedFullyPaid payments.amount" },
  quote: { model: SalesQuotation, number: "quoteNumber", date: "quoteDate", amount: "totalAmount", projection: "quoteNumber customerId quoteDate totalAmount status" },
  sales_order: { model: SaleOrder, number: "header.name", date: "header.dateOrder", amount: "totals.amountTotal", projection: "header salesOrderStatus status shipmentStatus totals salesInvoiceIds invoiceNumber" },
  customer: { model: Customer, number: "header.name", date: "createdAt", amount: null, projection: "header" },
  product: { model: Product, number: "tab_general_information.default_code", date: "createdAt", amount: "tab_general_information.list_price", projection: "header.name tab_general_information.list_price tab_general_information.default_code" },
};
export async function executeErpQuery(scope: { tenantId: string; role: string }, raw: unknown, now = new Date()) {
  requireSalesAccess(scope.role);
  if (!scope.tenantId) throw new ErpToolError("PERMISSION_DENIED", "Workspace is required.", 403);
  const parsed = erpQuerySchema.safeParse(raw);
  if (!parsed.success) throw new ErpToolError("INVALID_INPUT", "The record query contains invalid or unsupported parameters.");
  const q = parsed.data;
  if (q.operation === "lookup" && !q.identifier) throw new ErpToolError("INVALID_INPUT", "A document identifier is required.");
  if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo) throw new ErpToolError("INVALID_INPUT", "The date range is reversed.");
  if (q.amountMin !== undefined && q.amountMax !== undefined && q.amountMin > q.amountMax) throw new ErpToolError("INVALID_INPUT", "The amount range is reversed.");
  const c = config[q.entity];
  const filter: any = { tenantId: scope.tenantId };
  // Supplier-only partners share the Customer collection; Sales customer
  // counts must match the customer list and exclude those records.
  if (q.entity === "customer") filter.isCustomer = { $ne: false };
  if (q.status && q.entity !== "invoice") throw new ErpToolError("UNSUPPORTED_OPERATION", "This status filter is supported for invoices only.");
  if (q.status === "issued") Object.assign(filter, issuedInvoiceFilter());
  else if (q.status === "unpaid" || q.status === "overdue") Object.assign(filter, unpaidInvoiceFilter(q.status === "overdue" ? now : undefined));
  else if (q.status) filter.status = q.status;
  if (q.identifier) filter[c.number] = { $regex: `^${escapeRegex(q.identifier)}$`, $options: "i" };
  if (q.name) {
    const fields = q.entity === "customer" ? ["header.name", "header.companyName", "header.displayName"] : [c.number, "header.name"];
    filter.$or = fields.map(f => ({ [f]: { $regex: escapeRegex(q.name!), $options: "i" } }));
  }
  if (q.customer) {
    if (!["invoice", "quote", "sales_order"].includes(q.entity)) throw new ErpToolError("INVALID_INPUT", "Customer filtering does not apply to this entity.");
    const customer = await resolveCustomer(scope.tenantId, q.customer);
    filter[q.entity === "sales_order" ? "header.partnerId" : "customerId"] = customer._id;
  }
  if (q.dateFrom || q.dateTo) filter[c.date] = { ...(q.dateFrom ? { $gte: new Date(q.dateFrom) } : {}), ...(q.dateTo ? { $lte: new Date(q.dateTo) } : {}) };
  if (q.amountMin !== undefined || q.amountMax !== undefined) {
    if (!c.amount) throw new ErpToolError("INVALID_INPUT", "This entity has no amount field.");
    filter[c.amount] = { ...(q.amountMin !== undefined ? { $gte: q.amountMin } : {}), ...(q.amountMax !== undefined ? { $lte: q.amountMax } : {}) };
  }
  const model: any = c.model;
  if (q.operation === "count") return { query: q, count: await model.countDocuments(filter).maxTimeMS(5000), rows: [], total: null };
  const amountExpression = q.entity === "invoice" && ["unpaid", "overdue"].includes(q.status ?? "") ? invoiceOutstandingExpression : c.amount ? `$${c.amount}` : null;
  if (["sum", "group"].includes(q.operation)) {
    if (!amountExpression) throw new ErpToolError("INVALID_INPUT", "This entity has no amount to sum.");
    if (q.operation === "group" && !["invoice", "quote"].includes(q.entity)) throw new ErpToolError("UNSUPPORTED_OPERATION", "Grouping is supported by invoice or quote status.");
    const rows = await model.aggregate([{ $match: filter }, { $group: { _id: q.operation === "group" ? "$status" : null, total: { $sum: amountExpression }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).option({ maxTimeMS: 5000 });
    return { query: q, rows, total: rows.reduce((a: number, r: any) => a + r.total, 0), count: rows.reduce((a: number, r: any) => a + r.count, 0) };
  }
  const sortField = q.sort.startsWith("amount") ? c.amount : c.date;
  if (!sortField) throw new ErpToolError("INVALID_INPUT", "This sort is unsupported.");
  const rows = await model.find(filter).select(c.projection).sort({ [sortField]: q.sort.endsWith("asc") ? 1 : -1, _id: 1 }).skip(q.offset).limit(q.operation === "lookup" ? 1 : q.limit).maxTimeMS(5000).lean();
  // Resolve references through separate tenant-scoped queries; populate alone does not enforce tenant ownership.
  const ids = rows.map((r: any) => r.customerId || r.header?.partnerId).filter(Boolean);
  const customers = ids.length ? await Customer.find({ tenantId: scope.tenantId, _id: { $in: ids } }).select("header").maxTimeMS(5000).lean() : [];
  const names = new Map(customers.map(c => [String(c._id), customerName(c)]));
  for (const row of rows) {
    row.customerName = names.get(String(row.customerId || row.header?.partnerId));
    if (q.entity === "product") {
      row.onHandQuantity = await getOnHandQuantity(scope.tenantId, String(row._id));
    }
    if (q.entity === "sales_order") {
      row.invoices = await SalesInvoice.find({ tenantId: scope.tenantId, _id: { $in: row.salesInvoiceIds || [] } }).select("number status totalAmount payments markedFullyPaid").limit(25).maxTimeMS(5000).lean();
      row.paymentsReceived = (row.invoices || []).reduce((sum: number, inv: any) => sum + (inv.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0), 0);
      row.totalInvoiced = (row.invoices || []).reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0);
    }
  }
  return { query: q, rows, count: await model.countDocuments(filter).maxTimeMS(5000), total: null };
}
