/**
 * Digital Business Twin — relationship graph (6.11).
 *
 * Builds a Customer → Invoice → Payment (receivables) and Vendor → Bill
 * (payables) money-flow graph from REAL aggregation queries across existing
 * models. Bounded (top customers/vendors by value) so it stays a readable map,
 * not a data dump. Also exposes the outstanding receivables used by the
 * cash-flow simulation.
 */
import dbConnect from "@/lib/db";
import { SalesInvoice } from "@/models/SalesInvoice";
import Customer from "@/models/Customer";
import Invoice from "@/models/Invoice"; // accounting invoices (in_invoice = payables)
import type { Receivable } from "@/lib/twin/cashflow";

export interface GraphNode { id: string; kind: "customer" | "vendor" | "invoice" | "bill"; label: string; value?: number; meta?: Record<string, unknown> }
export interface GraphEdge { from: string; to: string; kind: string; value?: number }
export interface BusinessGraph { nodes: GraphNode[]; edges: GraphEdge[]; stats: { customers: number; invoices: number; vendors: number; totalReceivable: number; totalPayable: number } }

export async function buildBusinessGraph(tenantId: string, opts: { maxCustomers?: number } = {}): Promise<BusinessGraph> {
  await dbConnect();
  const maxCustomers = opts.maxCustomers ?? 12;

  const invoices = await (SalesInvoice as any)
    .find({ tenantId })
    .select("number totalAmount status invoiceDate dueDate customerId")
    .sort({ invoiceDate: -1 })
    .limit(300)
    .lean();

  // Aggregate receivables by customer to rank the top ones.
  const byCustomer = new Map<string, { total: number; invoices: any[] }>();
  for (const inv of invoices) {
    if (!inv.customerId) continue;
    const key = String(inv.customerId);
    const rec = byCustomer.get(key) ?? { total: 0, invoices: [] };
    rec.total += inv.totalAmount || 0;
    rec.invoices.push(inv);
    byCustomer.set(key, rec);
  }
  const topCustomerIds = [...byCustomer.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, maxCustomers).map(([id]) => id);

  const customers = await Customer.find({ tenantId, _id: { $in: topCustomerIds } }).select("name displayName companyName").lean();
  const custName = (id: string) => {
    const c: any = customers.find((x: any) => String(x._id) === id);
    return c?.displayName || c?.name || c?.companyName || "Customer";
  };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let totalReceivable = 0;

  for (const cid of topCustomerIds) {
    const rec = byCustomer.get(cid)!;
    nodes.push({ id: `cust:${cid}`, kind: "customer", label: custName(cid), value: Math.round(rec.total) });
    for (const inv of rec.invoices.slice(0, 8)) {
      const invNode = `inv:${inv._id}`;
      const outstanding = inv.status === "paid" ? 0 : inv.totalAmount || 0;
      totalReceivable += outstanding;
      nodes.push({ id: invNode, kind: "invoice", label: inv.number || "INV", value: inv.totalAmount, meta: { status: inv.status, dueDate: inv.dueDate } });
      edges.push({ from: `cust:${cid}`, to: invNode, kind: "billed", value: inv.totalAmount });
    }
  }

  // Payables: accounting in_invoice grouped by vendor/partner.
  const bills = await (Invoice as any)
    .find({ tenantId, moveType: "in_invoice" })
    .select("name amountTotal partnerId state")
    .sort({ createdAt: -1 })
    .limit(120)
    .lean();
  let totalPayable = 0;
  const vendorSeen = new Set<string>();
  for (const b of bills) {
    const vid = b.partnerId ? `vend:${b.partnerId}` : "vend:unknown";
    if (!vendorSeen.has(vid)) {
      vendorSeen.add(vid);
      nodes.push({ id: vid, kind: "vendor", label: "Vendor", value: 0 });
    }
    const billNode = `bill:${b._id}`;
    totalPayable += b.state === "posted" ? (b.amountTotal || 0) : 0;
    nodes.push({ id: billNode, kind: "bill", label: b.name || "BILL", value: b.amountTotal, meta: { state: b.state } });
    edges.push({ from: vid, to: billNode, kind: "owed", value: b.amountTotal });
  }

  return {
    nodes,
    edges,
    stats: {
      customers: topCustomerIds.length,
      invoices: invoices.length,
      vendors: vendorSeen.size,
      totalReceivable: Math.round(totalReceivable),
      totalPayable: Math.round(totalPayable),
    },
  };
}

/** Outstanding (unpaid) receivables with a due date — feeds the cash-flow sim. */
export async function getOutstandingReceivables(tenantId: string): Promise<Receivable[]> {
  await dbConnect();
  const invoices = await (SalesInvoice as any)
    .find({ tenantId, status: { $ne: "paid" }, dueDate: { $ne: null } })
    .select("number totalAmount dueDate")
    .limit(500)
    .lean();
  return invoices
    .filter((i: any) => i.dueDate && (i.totalAmount || 0) > 0)
    .map((i: any) => ({ id: String(i._id), label: i.number, amount: i.totalAmount, dueDate: new Date(i.dueDate).toISOString() }));
}
