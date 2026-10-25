import type { ErpStructuredResponse, ErpRecordItem, ErpFinancialTotalSummary } from "./erpTypes";
import { formatSalesDate, formatSalesCurrency } from "@/lib/sales/formatters";

/**
 * Parses unformatted or legacy plain-text ERP answers into strongly-typed structures.
 * Ensures historical chats, reloaded threads, and fallback paths render with the exact same
 * high-fidelity UI as fresh typed server responses.
 */
export function parseStructuredErpText(text: string): ErpStructuredResponse | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();

  // 1. Unpaid / Search invoice or quote records list
  // Example pattern:
  // INV-0076 — Rajesh Kumar — ₹29,146 — saved — 22/9/2026
  // INV-0075 — Rajesh Kumar — ₹29,146 — saved — 22/9/2026
  // INV-0050 — Rajesh Kumar — ₹900 — saved — 2/8/2026
  // Total outstanding across all 3 matches: ₹59,192.
  const recordRowRegex = /(INV-\d+|QUO-\d+|SO-\d+|[A-Z0-9_-]{3,20})\s*—\s*([^—\n]+?)\s*—\s*(₹[\d,]+(?:\.\d+)?)\s*—\s*([^—\n]+?)\s*—\s*(\d{1,2}\/\d{1,2}\/\d{4})/g;
  const matches = [...trimmed.matchAll(recordRowRegex)];

  if (matches.length > 0) {
    const records: ErpRecordItem[] = matches.map((m) => {
      const docNum = m[1].trim();
      const customer = m[2].trim();
      const rawAmt = m[3].trim();
      const status = m[4].trim();
      const rawDate = m[5].trim();

      const numVal = Number(rawAmt.replace(/[₹,]/g, "")) || 0;
      let route = "/sales/invoices";
      if (docNum.startsWith("QUO")) route = "/sales/quotes";
      else if (docNum.startsWith("SO")) route = "/sales/orders";

      return {
        number: docNum,
        customerName: customer,
        amount: numVal,
        formattedAmount: rawAmt,
        status,
        date: formatSalesDate(rawDate),
        rawDate,
        route,
      };
    });

    // Check for trailing total summary: "Total outstanding across all 3 matches: ₹59,192."
    const totalMatch = trimmed.match(/Total\s+outstanding\s+across\s+all\s+(\d+)\s+matches:\s*(₹[\d,]+(?:\.\d+)?)/i);
    let total: ErpFinancialTotalSummary | undefined = undefined;
    if (totalMatch) {
      const count = Number(totalMatch[1]) || records.length;
      const formattedTotal = totalMatch[2];
      const amount = Number(formattedTotal.replace(/[₹,]/g, "")) || 0;
      total = {
        label: "Total outstanding",
        amount,
        formattedAmount: formattedTotal,
        count,
      };
    }

    const firstDoc = records[0].number || "";
    let entity = "invoice";
    let title = "Unpaid invoices";
    if (firstDoc.startsWith("QUO")) {
      entity = "quote";
      title = "Quotes";
    } else if (firstDoc.startsWith("SO")) {
      entity = "sales_order";
      title = "Sales orders";
    }

    return {
      type: "record_list",
      entity,
      title,
      records,
      total,
      totalCount: records.length,
    };
  }

  // 2. Count response
  // Example: "280 customer records." or "19 quote records." or "7 paid invoice records."
  const countMatch = trimmed.match(/^(\d+)\s+(?:([a-z_-]+)\s+)?([a-z_-]+)\s+records?\.?$/i);
  if (countMatch) {
    const count = Number(countMatch[1]);
    const status = countMatch[2] ? countMatch[2].toLowerCase() : undefined;
    const entity = countMatch[3].toLowerCase();
    const entityLabel = entity.replace(/s$/, "");
    const label = `Total ${status ? `${status} ` : ""}${entityLabel}s`;
    return {
      type: "count",
      count,
      status,
      entity,
      label,
    };
  }

  // 3. Financial total query
  // Example: "Total: ₹59,192 across 3 records." or "Issued invoice value...: ₹22,78,941 across 86 records."
  const totalQueryMatch = trimmed.match(/^(Total|Issued invoice value[^:]*):\s*(₹[\d,]+(?:\.\d+)?)(?:\s*\([^)]*\))?\s*across\s*(\d+)\s*records\.?(?:\s*Period:\s*(\S+)\s*to\s*(\S+)\.?)?/i);
  if (totalQueryMatch) {
    const label = totalQueryMatch[1].trim();
    const formattedAmount = totalQueryMatch[2];
    const amount = Number(formattedAmount.replace(/[₹,]/g, "")) || 0;
    const count = Number(totalQueryMatch[3]) || 0;
    const periodFrom = totalQueryMatch[4];
    const periodTo = totalQueryMatch[5];

    return {
      type: "financial_total",
      label,
      amount,
      formattedAmount,
      count,
      period: periodFrom ? { from: periodFrom, to: periodTo } : undefined,
    };
  }

  // Profit & Loss response
  if (trimmed.startsWith("Company financial analysis") || trimmed.startsWith("A reliable net profit or loss figure")) {
    const periodMatch = trimmed.match(/for \*\*(.*?)\*\*/);
    const periodLabel = periodMatch ? periodMatch[1] : undefined;
    const revMatch = trimmed.match(/Recognized revenue \/ income:\s*(₹[\d,]+(?:\.\d+)?)/i) || trimmed.match(/Issued sales invoice revenue:\s*(₹[\d,]+(?:\.\d+)?)/i);
    const expMatch = trimmed.match(/Total expenses:\s*(₹[\d,]+(?:\.\d+)?)/i) || trimmed.match(/Operating & direct expenses:\s*(₹[\d,]+(?:\.\d+)?)/i);
    const netMatch = trimmed.match(/Net (?:profit|loss):\s*(₹[\d,]+(?:\.\d+)?)/i);
    const entriesMatch = trimmed.match(/Posted journal entries analyzed:\s*(\d+)/i);
    const isProfit = trimmed.includes("**In Profit**");
    const isLoss = trimmed.includes("**In Loss**");
    const isIncomplete = trimmed.includes("cannot yet be calculated");

    const formattedRevenue = revMatch ? revMatch[1] : "₹0";
    const revenue = Number(formattedRevenue.replace(/[₹,]/g, "")) || 0;
    const formattedExpenses = expMatch ? expMatch[1] : "₹0";
    const expenses = Number(formattedExpenses.replace(/[₹,]/g, "")) || 0;
    const formattedNet = netMatch ? netMatch[1] : "₹0";
    const netVal = Number(formattedNet.replace(/[₹,]/g, "")) || 0;
    const netProfit = isLoss ? -netVal : netVal;
    const postedEntryCount = entriesMatch ? Number(entriesMatch[1]) : 0;

    const cogsMatch = trimmed.match(/Cost of Goods Sold \(COGS\):\s*(₹[\d,]+(?:\.\d+)?)/i);
    const formattedCogs = cogsMatch ? cogsMatch[1] : undefined;
    const cogs = formattedCogs ? Number(formattedCogs.replace(/[₹,]/g, "")) : undefined;

    return {
      type: "profit_loss",
      title: periodLabel ? `Profit & Loss Analysis — ${periodLabel}` : "Profit & Loss Analysis",
      period: periodLabel ? { type: "range", label: periodLabel } : undefined,
      revenue,
      formattedRevenue,
      expenses,
      formattedExpenses,
      cogs,
      formattedCogs,
      cogsTreatment: cogs ? "separated" : "included_in_expenses",
      cogsExplanation: cogs ? undefined : "COGS is included within general expenses or not separately categorized.",
      netProfit,
      formattedNetProfit: formattedNet,
      isProfitable: isProfit,
      status: isIncomplete ? "incomplete_data" : isProfit ? "profitable" : isLoss ? "loss" : "break_even",
      postedEntryCount,
      basis: isIncomplete ? "incomplete_data" : "posted_journal_entries",
    };
  }

  // Safety refusal
  if (trimmed.startsWith("Bulk deletion through the assistant is not supported")) {
    const draftMatch = trimmed.match(/(\d+)\s+drafts/i);
    const draftCount = draftMatch ? Number(draftMatch[1]) : 0;
    return {
      type: "safety_refusal",
      title: "Bulk Deletion Not Supported",
      message: trimmed,
      recordCount: draftCount,
      entity: "invoice",
      policy: "Bulk record deletions are restricted to manual administrative review to prevent accidental data loss.",
    };
  }

  // 4. Quote proposal draft
  // Example:
  // Quote draft — not saved:
  // Customer: Himalaya Fitness Studio
  // Item: Ergonomic Office Chair
  // Quantity: 2 chairs
  // Unit price: ₹7,499 per chair
  // Subtotal: ₹14,998
  // Discount: ₹0
  // Tax: ₹0
  // Total: ₹14,998
  // Confirm quote to save, or cancel quote.
  if (trimmed.startsWith("Quote draft — not saved:")) {
    const custMatch = trimmed.match(/Customer:\s*([^\n]+)/i);
    const itemMatch = trimmed.match(/Item:\s*([^\n]+)/i);
    const qtyMatch = trimmed.match(/Quantity:\s*([\d.]+)\s*([a-zA-Z]*)/i);
    const unitPriceMatch = trimmed.match(/Unit\s+price:\s*(₹[\d,]+(?:\.\d+)?)/i);
    const subtotalMatch = trimmed.match(/Subtotal:\s*(₹[\d,]+(?:\.\d+)?)/i);
    const discountMatch = trimmed.match(/Discount:\s*(₹[\d,]+(?:\.\d+)?)/i);
    const taxMatch = trimmed.match(/Tax:\s*(₹[\d,]+(?:\.\d+)?)/i);
    const totalMatch = trimmed.match(/Total:\s*(₹[\d,]+(?:\.\d+)?)/i);

    if (custMatch && itemMatch && qtyMatch && totalMatch) {
      const customer = custMatch[1].trim();
      const item = itemMatch[1].trim();
      const quantity = Number(qtyMatch[1]) || 1;
      const unit = qtyMatch[2]?.trim() || undefined;
      const formattedUnitPrice = unitPriceMatch ? unitPriceMatch[1] : "₹0";
      const unitPrice = Number(formattedUnitPrice.replace(/[₹,]/g, "")) || 0;
      const formattedSubtotal = subtotalMatch ? subtotalMatch[1] : formattedUnitPrice;
      const subtotal = Number(formattedSubtotal.replace(/[₹,]/g, "")) || 0;
      const formattedDiscount = discountMatch ? discountMatch[1] : "₹0";
      const discount = Number(formattedDiscount.replace(/[₹,]/g, "")) || 0;
      const formattedTax = taxMatch ? taxMatch[1] : "₹0";
      const tax = Number(formattedTax.replace(/[₹,]/g, "")) || 0;
      const formattedTotal = totalMatch[1];
      const totalAmt = Number(formattedTotal.replace(/[₹,]/g, "")) || 0;

      return {
        type: "quote_proposal",
        proposalId: "quote-draft",
        customer,
        item,
        quantity,
        unit,
        unitPrice,
        formattedUnitPrice,
        subtotal,
        formattedSubtotal,
        discount,
        formattedDiscount,
        tax,
        formattedTax,
        total: totalAmt,
        formattedTotal,
        status: "proposed",
      };
    }
  }

  // 5. Successfully saved quote
  // Example: "Saved quote QUO-000036 — draft — ₹14,998."
  const savedQuoteMatch = trimmed.match(/^Saved\s+quote\s+([A-Z0-9_-]+)\s*—\s*([^—\n]+)\s*—\s*(₹[\d,]+(?:\.\d+)?)\.?$/i);
  if (savedQuoteMatch) {
    const quoteNumber = savedQuoteMatch[1].trim();
    const status = savedQuoteMatch[2].trim();
    const formattedTotal = savedQuoteMatch[3].trim();
    const total = Number(formattedTotal.replace(/[₹,]/g, "")) || 0;

    return {
      type: "quote_saved",
      quoteNumber,
      status,
      total,
      formattedTotal,
      route: "/sales/quotes",
    };
  }

  // Customer proposal draft
  // Example: "Customer draft — not saved:\n\nName: Kishore\nType: Not specified..."
  if (trimmed.startsWith("Customer draft — not saved:")) {
    const nameMatch = trimmed.match(/Name:\s*([^\n]+)/i);
    const typeMatch = trimmed.match(/Type:\s*([^\n]+)/i);
    const phoneMatch = trimmed.match(/Phone:\s*([^\n]+)/i);
    const emailMatch = trimmed.match(/Email:\s*([^\n]+)/i);

    const rawName = nameMatch ? nameMatch[1].trim() : "";
    const name = rawName && rawName.toLowerCase() !== "missing" ? rawName : undefined;
    const typeStr = typeMatch ? typeMatch[1].trim() : "";
    const isCompany = typeStr.toLowerCase() === "company" ? true : typeStr.toLowerCase() === "individual" ? false : undefined;
    const phone = phoneMatch ? phoneMatch[1].trim() : undefined;
    const email = emailMatch ? emailMatch[1].trim() : undefined;

    const missingFields: string[] = [];
    if (!name) missingFields.push("name");
    if (isCompany === undefined) missingFields.push("type");

    return {
      type: "customer_proposal",
      proposalId: "customer-draft",
      name,
      isCompany,
      phone,
      email,
      missingFields,
      status: "proposed",
    };
  }

  // Successfully saved customer
  // Example: Saved customer "Kishore K" (Individual).
  const savedCustomerMatch = trimmed.match(/^Saved\s+customer\s+"([^"]+)"\s*\((Company|Individual)\)\.?$/i);
  if (savedCustomerMatch) {
    const name = savedCustomerMatch[1].trim();
    const isCompany = savedCustomerMatch[2].toLowerCase() === "company";
    return {
      type: "customer_saved",
      name,
      isCompany,
      route: "/sales/customers",
    };
  }

  // 6. Not found response
  // Example: "INV-9999 was not found in your accessible records."
  const notFoundMatch = trimmed.match(/^(\S+)\s+was\s+not\s+found\s+in\s+your\s+accessible\s+records\.?$/i);
  if (notFoundMatch) {
    return {
      type: "not_found",
      identifier: notFoundMatch[1],
      message: trimmed,
    };
  }
  if (trimmed === "No matching records were found in your accessible records.") {
    return {
      type: "not_found",
      message: trimmed,
    };
  }

  return null;
}
