import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (
      !session?.user ||
      (session.user.role !== "admin" && session.user.role !== "master-admin")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, range } = await request.json();
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    // Import all models
    const [
      Invoice,
      SaleOrder,
      Product,
      Customer,
      StockTransfer,
      ManufacturingOrder,
      Account,
      Warehouse,
    ] = await Promise.all([
      import("@/models/Invoice").then((m) => m.default),
      import("@/models/SaleOrder").then((m) => m.default),
      import("@/models/Product").then((m) => m.default),
      import("@/models/Customer").then((m) => m.default),
      import("@/models/StockTransfer").then((m) => m.default),
      import("@/models/ManufacturingOrder").then((m) => m.default),
      import("@/models/Account").then((m) => m.default),
      import("@/models/Warehouse").then((m) => m.default),
    ]);

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (range) {
      case "last_7_days":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "last_30_days":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "this_month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "last_month":
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case "this_year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    let htmlContent = "";

    // ALL TEXT IN BLACK - NO COLORS
    switch (type) {
      case "sales": {
        const [orders, customers] = await Promise.all([
          SaleOrder.find({ tenantId, createdAt: { $gte: startDate } }).lean(),
          Customer.find({ tenantId, createdAt: { $gte: startDate } }).lean(),
        ]);

        const totalOrders = orders.length;
        const totalRevenue = orders.reduce(
          (sum, o: any) => sum + (Number(o.amountTotal) || 0),
          0,
        );
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Sales Performance Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Key Metrics</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Metric</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Total Orders</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${totalOrders}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Total Revenue</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${totalRevenue.toLocaleString()}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Average Order Value</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${avgOrderValue.toFixed(2)}</td>
                </tr>
                <tr>
                  <td class="py-3 px-4 font-medium text-black">New Customers</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${customers.length}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Analysis & Insights</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Customer Growth:</strong> ${customers.length} new customer${customers.length !== 1 ? "s" : ""} acquired during this period.</li>
              <li><strong>Order Volume:</strong> Total of ${totalOrders} sales orders processed with consistent performance.</li>
              <li><strong>Recommendation:</strong> ${avgOrderValue > 10000 ? "Maintain current sales strategies to preserve high order values." : "Consider upselling strategies to increase average order value."}</li>
            </ul>
          </div>
        `;
        break;
      }

      case "finance": {
        const [invoices, bills] = await Promise.all([
          Invoice.find({ tenantId, moveType: "out_invoice" }).lean(),
          Invoice.find({ tenantId, moveType: "in_invoice" }).lean(),
        ]);

        const revenue = invoices
          .filter((inv: any) => inv.state === DOCUMENT_STATUS.POSTED)
          .reduce((sum, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);
        const expenses = bills
          .filter((inv: any) => inv.state === DOCUMENT_STATUS.POSTED)
          .reduce((sum, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);
        const netIncome = revenue - expenses;
        const profitMargin =
          revenue > 0 ? ((netIncome / revenue) * 100).toFixed(1) : 0;

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Financial Summary Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Financial Overview</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Category</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Revenue (Customer Invoices)</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${revenue.toLocaleString()}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Expenses (Vendor Bills)</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${expenses.toLocaleString()}</td>
                </tr>
                <tr class="border-b border-gray-300 bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Net ${netIncome >= 0 ? "Profit" : "Loss"}</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${Math.abs(netIncome).toLocaleString()}</td>
                </tr>
                <tr>
                  <td class="py-3 px-4 font-medium text-black">Profit Margin</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${profitMargin}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Financial Health</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Status:</strong> Current financial position is ${netIncome >= 0 ? "profitable" : "showing a loss"}.</li>
              <li><strong>Activity:</strong> ${invoices.length} customer invoices and ${bills.length} vendor bills recorded.</li>
              <li><strong>Recommendation:</strong> ${netIncome >= 0 ? "Maintain current revenue streams and control expenses." : "Review expense categories and explore revenue growth opportunities."}</li>
            </ul>
          </div>
        `;
        break;
      }

      case "inventory": {
        const [products, transfers] = await Promise.all([
          Product.find({ tenantId }).lean(),
          StockTransfer.find({ tenantId, createdAt: { $gte: startDate } }).lean(),
        ]);

        const activeProducts = products.filter(
          (p: any) => p.status === "published",
        ).length;
        const incomingTransfers = transfers.filter(
          (t: any) => t.operationType === "incoming",
        ).length;
        const outgoingTransfers = transfers.filter(
          (t: any) => t.operationType === "outgoing",
        ).length;

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Inventory Health Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Inventory Status</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Category</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Total Products in Catalog</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${products.length}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Active Products</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${activeProducts}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Draft Products</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${products.length - activeProducts}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Incoming Transfers (Receipts)</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${incomingTransfers}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Outgoing Transfers (Deliveries)</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${outgoingTransfers}</td>
                </tr>
                <tr class="bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Net Stock Movement</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${incomingTransfers - outgoingTransfers} transfers</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Operations Summary</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Movement Tracking:</strong> ${transfers.length} total stock movements recorded during this period.</li>
              <li><strong>Product Catalog:</strong> ${products.length} products available with ${activeProducts} actively published.</li>
              <li><strong>Stock Balance:</strong> ${incomingTransfers > outgoingTransfers ? "Inventory levels increasing" : incomingTransfers < outgoingTransfers ? "Inventory levels decreasing" : "Inventory levels stable"}.</li>
            </ul>
          </div>
        `;
        break;
      }

      case "manufacturing": {
        const moOrders = await ManufacturingOrder.find({
          tenantId,
          createdAt: { $gte: startDate },
        }).lean();

        const total = moOrders.length;
        const confirmed = moOrders.filter(
          (mo: any) => mo.state === DOCUMENT_STATUS.APPROVED,
        ).length;
        const done = moOrders.filter((mo: any) => mo.state === DOCUMENT_STATUS.CLOSED).length;
        const draft = moOrders.filter((mo: any) => mo.state === DOCUMENT_STATUS.DRAFT).length;

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Manufacturing Status Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Production Overview</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Status</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Orders</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Draft Orders</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${draft}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">In Progress (Confirmed)</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${confirmed}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Completed</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${done}</td>
                </tr>
                <tr class="border-b border-gray-300 bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Total Manufacturing Orders</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${total}</td>
                </tr>
                <tr>
                  <td class="py-3 px-4 font-medium text-black">Completion Rate</td>
                  <td class="py-3 px-4 text-right font-bold text-black">${total > 0 ? ((done / total) * 100).toFixed(1) : 0}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Production Insights</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Completed Production:</strong> ${done} manufacturing orders successfully completed (${total > 0 ? ((done / total) * 100).toFixed(1) : 0}% completion rate).</li>
              <li><strong>Active Pipeline:</strong> ${confirmed} orders currently in production process.</li>
              <li><strong>Recommendation:</strong> ${confirmed > done ? "Focus on completing in-progress orders to improve efficiency." : "Production capacity available for new orders."}</li>
            </ul>
          </div>
        `;
        break;
      }

      case "customers": {
        const customers = await Customer.find({ tenantId })
          .populate("createdBy")
          .lean();
        const recentCustomers = customers.filter(
          (c: any) => new Date(c.createdAt) >= startDate,
        );

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Customer Listing Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Customer Overview</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Customer Name</th>
                  <th class="py-3 px-4 font-bold text-black">Email</th>
                  <th class="py-3 px-4 font-bold text-black">Phone</th>
                  <th class="py-3 px-4 font-bold text-black">City</th>
                </tr>
              </thead>
              <tbody>
                ${customers
                  .slice(0, 50)
                  .map(
                    (c: any, i: number) => `
                  <tr class="${i < customers.length - 1 ? "border-b border-gray-300" : ""}">
                    <td class="py-3 px-4 font-medium text-black">${c.header?.name || "N/A"}</td>
                    <td class="py-3 px-4 text-black">${c.contact_details?.email || "N/A"}</td>
                    <td class="py-3 px-4 text-black">${c.contact_details?.phone || "N/A"}</td>
                    <td class="py-3 px-4 text-black">${c.address_tab?.city || "N/A"}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
            ${customers.length > 50 ? `<p class="text-sm text-black italic">Showing first 50 of ${customers.length} customers</p>` : ""}
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Summary</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Total Customers:</strong> ${customers.length} customers in database.</li>
              <li><strong>New Customer s This Period:</strong> ${recentCustomers.length} new customers added.</li>
              <li><strong>Growth Rate:</strong> ${customers.length > 0 ? ((recentCustomers.length / customers.length) * 100).toFixed(1) : 0}% of total customers are new.</li>
            </ul>
          </div>
        `;
        break;
      }

      case "products": {
        const products = await Product.find({ tenantId }).lean();
        const recentProducts = products.filter(
          (p: any) => new Date(p.createdAt) >= startDate,
        );

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Product Catalog Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Product Listing</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Product Name</th>
                  <th class="py-3 px-4 font-bold text-black">Type</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Sale Price</th>
                  <th class="py-3 px-4 font-bold text-black text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${products
                  .slice(0, 50)
                  .map(
                    (p: any, i: number) => `
                  <tr class="${i < products.length - 1 ? "border-b border-gray-300" : ""}">
                    <td class="py-3 px-4 font-medium text-black">${p.header?.name || "N/A"}</td>
                    <td class="py-3 px-4 text-black">${p.tab_general_information?.type || "N/A"}</td>
                    <td class="py-3 px-4 text-right text-black">₹${p.tab_general_information?.list_price?.toLocaleString() || 0}</td>
                    <td class="py-3 px-4 text-center text-black">${p.status || "draft"}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
            ${products.length > 50 ? `<p class="text-sm text-black italic">Showing first 50 of ${products.length} products</p>` : ""}
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Summary</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Total Products:</strong> ${products.length} products in catalog.</li>
              <li><strong>Published Products:</strong> ${products.filter((p: any) => p.status === "published").length} ready for sale.</li>
              <li><strong>New Products This Period:</strong> ${recentProducts.length} products added.</li>
            </ul>
          </div>
        `;
        break;
      }

      case "ledger": {
        const [accounts, invoices] = await Promise.all([
          Account.find({ tenantId }).lean(),
          Invoice.find({ tenantId }).lean(),
        ]);

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">General Ledger Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Chart of Accounts</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Account Code</th>
                  <th class="py-3 px-4 font-bold text-black">Account Name</th>
                  <th class="py-3 px-4 font-bold text-black">Type</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                ${accounts
                  .slice(0, 50)
                  .map(
                    (a: any, i: number) => `
                  <tr class="${i < accounts.length - 1 ? "border-b border-gray-300" : ""}">
                    <td class="py-3 px-4 font-medium text-black">${a.code || "N/A"}</td>
                    <td class="py-3 px-4 text-black">${a.name || "N/A"}</td>
                    <td class="py-3 px-4 text-black">${a.accountType || "N/A"}</td>
                    <td class="py-3 px-4 text-right text-black">₹${a.currentBalance?.toLocaleString() || 0}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
            ${accounts.length > 50 ? `<p class="text-sm text-black italic">Showing first 50 of ${accounts.length} accounts</p>` : ""}
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Summary</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Total Accounts:</strong> ${accounts.length} accounts in chart of accounts.</li>
              <li><strong>Total Transactions:</strong> ${invoices.length} invoices/bills recorded.</li>
            </ul>
          </div>
        `;
        break;
      }

      case "stock": {
        const [products, transfers] = await Promise.all([
          Product.find({ tenantId }).lean(),
          StockTransfer.find({ tenantId, createdAt: { $gte: startDate } }).lean(),
        ]);

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Stock Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Stock Levels by Product</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Product</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Quantity on Hand</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Reserved</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                ${products
                  .slice(0, 50)
                  .map(
                    (p: any, i: number) => `
                  <tr class="${i < products.length - 1 ? "border-b border-gray-300" : ""}">
                    <td class="py-3 px-4 font-medium text-black">${p.header?.name || "N/A"}</td>
                    <td class="py-3 px-4 text-right text-black">${p.tab_inventory?.quantity_on_hand || 0}</td>
                    <td class="py-3 px-4 text-right text-black">${p.tab_inventory?.reserved_quantity || 0}</td>
                    <td class="py-3 px-4 text-right text-black">${(p.tab_inventory?.quantity_on_hand || 0) - (p.tab_inventory?.reserved_quantity || 0)}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
            ${products.length > 50 ? `<p class="text-sm text-black italic">Showing first 50 of ${products.length} products</p>` : ""}
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Stock Movements This Period</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Total Movements:</strong> ${transfers.length} stock transfers recorded.</li>
              <li><strong>Incoming:</strong> ${transfers.filter((t: any) => t.operationType === "incoming").length} receipts.</li>
              <li><strong>Outgoing:</strong> ${transfers.filter((t: any) => t.operationType === "outgoing").length} deliveries.</li>
            </ul>
          </div>
        `;
        break;
      }

      case "warehouse": {
        const [warehouses, transfers] = await Promise.all([
          Warehouse.find({ tenantId }).lean(),
          StockTransfer.find({ tenantId, createdAt: { $gte: startDate } }).lean(),
        ]);

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Warehouse Status Report</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Warehouse Listing</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Warehouse Name</th>
                  <th class="py-3 px-4 font-bold text-black">Location</th>
                  <th class="py-3 px-4 font-bold text-black text-center">Active</th>
                </tr>
              </thead>
              <tbody>
                ${
                  warehouses.length > 0
                    ? warehouses
                        .map(
                          (w: any, i: number) => `
                  <tr class="${i < warehouses.length - 1 ? "border-b border-gray-300" : ""}">
                    <td class="py-3 px-4 font-medium text-black">${w.name || "N/A"}</td>
                    <td class="py-3 px-4 text-black">${w.address || "N/A"}</td>
                    <td class="py-3 px-4 text-center text-black">${w.isActive ? "Yes" : "No"}</td>
                  </tr>
                `,
                        )
                        .join("")
                    : `
                  <tr>
                    <td colspan="3" class="py-3 px-4 text-center text-black">No warehouses configured</td>
                  </tr>
                `
                }
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Summary</h3>
            <ul class="space-y-3 text-black list-disc ml-6">
              <li><strong>Total Warehouses:</strong> ${warehouses.length} warehouse locations.</li>
              <li><strong>Active Warehouses:</strong> ${warehouses.filter((w: any) => w.isActive).length} currently operational.</li>
              <li><strong>Stock Movements This Period:</strong> ${transfers.length} transfers across all warehouses.</li>
            </ul>
          </div>
        `;
        break;
      }

      case "pl": {
        const invoices = await Invoice.find({ tenantId }).lean();

        // Income (Customer Invoices - out_invoice)
        const incomeInvoices = invoices.filter(
          (inv: any) =>
            inv.moveType === "out_invoice" && inv.state === DOCUMENT_STATUS.POSTED,
        );
        const totalIncome = incomeInvoices.reduce(
          (sum, inv: any) => sum + (Number(inv.amountTotal) || 0),
          0,
        );

        // Expenses (Vendor Bills - in_invoice)
        const expenseInvoices = invoices.filter(
          (inv: any) => inv.moveType === "in_invoice" && inv.state === DOCUMENT_STATUS.POSTED,
        );
        const totalExpenses = expenseInvoices.reduce(
          (sum, inv: any) => sum + (Number(inv.amountTotal) || 0),
          0,
        );

        const netProfit = totalIncome - totalExpenses;

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Profit & Loss Statement</h2>
            <p class="text-sm text-black">Period: ${range.replace(/_/g, " ").toUpperCase()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Income</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Description</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Revenue from Sales</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${totalIncome.toLocaleString()}</td>
                </tr>
                <tr class="bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Total Income</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${totalIncome.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Expenses</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Description</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Cost of Goods Sold / Operating Expenses</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${totalExpenses.toLocaleString()}</td>
                </tr>
                <tr class="bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Total Expenses</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${totalExpenses.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Net Profit / Loss</h3>
            <table class="w-full text-left mb-6 border-2 border-black">
              <tbody>
                <tr class="bg-gray-100">
                  <td class="py-4 px-4 font-bold text-lg text-black">Net ${netProfit >= 0 ? "Profit" : "Loss"}</td>
                  <td class="py-4 px-4 text-right font-bold text-lg text-black">₹${Math.abs(netProfit).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            <p class="text-sm text-black italic">Total Income (₹${totalIncome.toLocaleString()}) - Total Expenses (₹${totalExpenses.toLocaleString()}) = ${netProfit >= 0 ? "Profit" : "Loss"} (₹${Math.abs(netProfit).toLocaleString()})</p>
          </div>
        `;
        break;
      }

      case "balance": {
        const [invoices, products] = await Promise.all([
          Invoice.find({ tenantId }).lean(),
          Product.find({ tenantId }).lean(),
        ]);

        // Current Assets - Accounts Receivable (Amount Due on Customer Invoices)
        const receivables = invoices
          .filter(
            (inv: any) =>
              inv.moveType === "out_invoice" && inv.state === DOCUMENT_STATUS.POSTED,
          )
          .reduce(
            (sum, inv: any) => sum + (Number(inv.amountResidual) || 0),
            0,
          );

        // Inventory Value (Products * Cost)
        const inventoryValue = products.reduce((sum, p: any) => {
          const qty = p.tab_inventory?.quantity_on_hand || 0;
          const cost = p.tab_general_information?.standard_price || 0;
          return sum + qty * cost;
        }, 0);

        const totalCurrentAssets = receivables + inventoryValue;

        // Current Liabilities - Accounts Payable (Amount Due on Vendor Bills)
        const payables = invoices
          .filter(
            (inv: any) =>
              inv.moveType === "in_invoice" && inv.state === DOCUMENT_STATUS.POSTED,
          )
          .reduce(
            (sum, inv: any) => sum + (Number(inv.amountResidual) || 0),
            0,
          );

        const totalCurrentLiabilities = payables;

        // Equity = Assets - Liabilities
        const equity = totalCurrentAssets - totalCurrentLiabilities;

        htmlContent = `
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-black mb-2">Balance Sheet</h2>
            <p class="text-sm text-black">As of: ${new Date().toLocaleDateString()}</p>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Assets</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Description</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Accounts Receivable</td>
                  <td class="py-3 px-4 text-right text-black">₹${receivables.toLocaleString()}</td>
                </tr>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Inventory</td>
          <td class="py-3 px-4 text-right text-black">₹${inventoryValue.toLocaleString()}</td>
                </tr>
                <tr class="bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Total Current Assets</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${totalCurrentAssets.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Liabilities</h3>
            <table class="w-full text-left mb-6 border border-black">
              <thead>
                <tr class="border-b-2 border-black bg-gray-100">
                  <th class="py-3 px-4 font-bold text-black">Description</th>
                  <th class="py-3 px-4 font-bold text-black text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-300">
                  <td class="py-3 px-4 font-medium text-black">Accounts Payable</td>
                  <td class="py-3 px-4 text-right text-black">₹${payables.toLocaleString()}</td>
                </tr>
                <tr class="bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Total Current Liabilities</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${totalCurrentLiabilities.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Equity</h3>
            <table class="w-full text-left mb-6 border border-black">
              <tbody>
                <tr class="bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Owner's Equity</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${equity.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mb-8">
            <h3 class="text-lg font-bold mb-4 text-black border-b-2 border-black pb-2">Balance Check</h3>
            <table class="w-full text-left border-2 border-black">
              <tbody>
                <tr class="border-b border-gray-300 bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Total Assets</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${totalCurrentAssets.toLocaleString()}</td>
                </tr>
                <tr class="bg-gray-100">
                  <td class="py-3 px-4 font-bold text-black">Total Liabilities + Equity</td>
                  <td class="py-3 px-4 text-right font-bold text-black">₹${(totalCurrentLiabilities + equity).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            <p class="text-sm text-black italic mt-2">Assets = Liabilities + Equity (Balance Sheet Equation)</p>
          </div>
        `;
        break;
      }

      default:
        htmlContent = `<p class="text-black">Report type not available.</p>`;
    }

    return NextResponse.json({
      htmlContent,
      generatedAt: new Date().toISOString(),
      type,
      range,
    });
  } catch (error) {
    console.error("Report Generation Error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 },
    );
  }
}
