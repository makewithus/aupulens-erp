import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { SALES_INVOICE_STATUS, SALES_INVOICE_STATUS_VALUES } from "@/lib/constants/statuses";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatCurrency(n: number): string {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatDate(d: any): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function customerDisplayName(c: any): string {
  return c?.header?.displayName || c?.header?.companyName || c?.header?.name || "Unnamed customer";
}

interface Extracted {
  entity: "customer" | "invoice" | "none";
  wantsToOpen: boolean;
  nameQuery: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

/**
 * "AI memory" — real database lookups for factual Sales questions ("does this
 * customer exist", "was an invoice created in the first week of August",
 * "show me invoices from last month"), as opposed to /api/sales/ai-assistant's
 * fixed-snapshot analytics chat. Gated behind lib/ai/memoryFlow.ts's cheap
 * regex check on the client, so this route is only hit for messages that
 * plausibly ask about a customer or invoice record.
 *
 * The LLM is used ONLY to extract a structured query (entity/name/date-range/
 * status/browse-intent) from the free-text question — the actual answer shown
 * to the user is built deterministically from real query results, never
 * LLM-generated prose, so it's always complete and never invents data.
 *
 * Always returns 200 with `handled: false` on anything it can't confidently
 * resolve (bad JSON, unrecognized entity, auth/DB error) so the caller can
 * fall through to the normal conversational assistant without ever breaking
 * the chat.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, handled: false }, { status: 401 });
    }
    // Read-only lookup over the same tenant-scoped data the real
    // /api/sales/customers and /api/sales/invoices routes already serve to
    // any authenticated tenant member (no role restriction there) — this
    // route previously required role === "sales" | "admin", which silently
    // 401'd every other role's global-assistant query about a customer or
    // invoice, even though they could see the same data by visiting the page.
    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ success: false, handled: false }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const message: string = String(body.text || body.message || "").trim();
    if (!message) return NextResponse.json({ success: true, handled: false });

    await connectDB();

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    const prompt = `You are extracting a structured lookup query from a Sales-module chat question in an ERP system. Today's date is ${todayIso}.

User question: "${message}"

Return ONLY JSON (no markdown, no prose) in this exact shape:
{"entity": "customer" | "invoice" | "none", "wantsToOpen": false, "nameQuery": "", "dateFrom": "", "dateTo": "", "status": ""}

Rules:
- "entity": "customer" for questions about a customer/client existing, or a list/count of customers. "invoice" for questions about invoices/bills. "none" if the question isn't actually asking to look up or list customer/invoice records (a how-to question, or unrelated) — when "none", leave every other field at its empty/false default.
- "wantsToOpen": true whenever the user is asking for a LIST or SET of records rather than a single yes/no fact — this includes "show me", "take me to", "open", "go to", "list all", "I want to see/the ...", but ALSO "give me all/the ...", "get me ...", "fetch ...", "pull up ...", "what are all the ...", or any plural request scoped by a filter (a date range, a status) with no single specific name/number mentioned. false only for a genuine yes/no or single-fact question ("does X exist", "was there an invoice for X", "how many customers this month", "check if X exists", "did we create an invoice for X").
- "nameQuery": a customer/company name mentioned, or an invoice number mentioned. Empty string if none mentioned.
- "dateFrom"/"dateTo": resolve ANY date-range phrasing to real YYYY-MM-DD dates using today (${todayIso}) as the anchor. An explicit date WITH a year (e.g. "15 Aug 2026", "since 15 August 2026", "after 15/08/2026") is absolute — use that exact date, even if it's in the future relative to your training data; today's date above is the only source of truth for "now"/"future". "X till now"/"X to date"/"since X" → dateFrom = X, dateTo empty (an open-ended range needs no upper bound). "first week of August" → the 1st to the 7th of the nearest August not in the future. "last three months" → 3 months before today to today. "this month" → the 1st of the current month to today. "in August" with no year → the nearest August that is not in the future. If there is NO date phrasing at all, leave both empty strings.
- "status" (invoices only): exactly one of draft, saved, partially_paid, paid, overdue, cancelled, unpaid — only when the user clearly names a payment status ("unpaid invoices", "overdue ones", "paid invoices"). Empty string otherwise.
- Never invent a name or a date that isn't implied by the question. Output strict JSON, nothing else.`;

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { maxTokens: 300 });
    if (!("text" in result)) {
      // Gated (AI disabled / cap reached) — fall through silently, let the
      // normal assistant call surface the real gated error to the user.
      return NextResponse.json({ success: true, handled: false });
    }

    let extracted: Extracted | undefined;
    try {
      const m = result.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : result.text);
      if (parsed && (parsed.entity === "customer" || parsed.entity === "invoice" || parsed.entity === "none")) {
        extracted = {
          entity: parsed.entity,
          wantsToOpen: Boolean(parsed.wantsToOpen),
          nameQuery: String(parsed.nameQuery || "").trim(),
          dateFrom: String(parsed.dateFrom || "").trim(),
          dateTo: String(parsed.dateTo || "").trim(),
          status: String(parsed.status || "").trim().toLowerCase(),
        };
      }
    } catch {
      // fall through — handled below
    }

    if (!extracted || extracted.entity === "none") {
      return NextResponse.json({ success: true, handled: false });
    }

    const dateFromValid = extracted.dateFrom && !isNaN(Date.parse(extracted.dateFrom)) ? extracted.dateFrom : "";
    const dateToValid = extracted.dateTo && !isNaN(Date.parse(extracted.dateTo)) ? extracted.dateTo : "";

    // Deterministic safety net: a request scoped by a date range or status
    // with no single specific name/number is definitionally "browse a
    // filtered set", not a yes/no fact check — redirect regardless of what
    // the model decided for wantsToOpen, since not redirecting here is the
    // failure mode that actually matters (the user is left with only a
    // chat summary and no way to see the real, filtered page).
    if (!extracted.nameQuery && (dateFromValid || dateToValid || extracted.status)) {
      extracted.wantsToOpen = true;
    }
    const rangeLabel =
      dateFromValid && dateToValid
        ? `${formatDate(dateFromValid)} – ${formatDate(dateToValid)}`
        : dateFromValid
          ? `since ${formatDate(dateFromValid)}`
          : dateToValid
            ? `up to ${formatDate(dateToValid)}`
            : "";

    if (extracted.entity === "customer") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [
          { "header.name": rx },
          { "header.displayName": rx },
          { "header.companyName": rx },
          { "contact_details.email": rx },
        ];
      }
      if (dateFromValid || dateToValid) {
        query.createdAt = {};
        if (dateFromValid) query.createdAt.$gte = new Date(dateFromValid);
        if (dateToValid) {
          const end = new Date(dateToValid);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }

      const [total, customers] = await Promise.all([
        Customer.countDocuments(query),
        Customer.find(query).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        route = `/sales/customers${params.toString() ? `?${params.toString()}` : ""}`;
      }

      let message2: string;
      if (extracted.nameQuery && total > 0 && !extracted.wantsToOpen) {
        // A specific existence check for one name — answer with the real record.
        const c: any = customers[0];
        const bits = [
          c.header?.companyName ? `Company: ${c.header.companyName}` : "",
          c.contact_details?.email ? `Email: ${c.contact_details.email}` : "",
          c.contact_details?.phone || c.contact_details?.mobile
            ? `Phone: ${c.contact_details.phone || c.contact_details.mobile}`
            : "",
          c.gstin ? `GSTIN: ${c.gstin}` : "",
          `Customer since: ${formatDate(c.createdAt)}`,
        ].filter(Boolean);
        message2 = `Yes — **${customerDisplayName(c)}** exists in the system.\n\n${bits.map((b) => `• ${b}`).join("\n")}`;
      } else if (extracted.nameQuery && total === 0 && !extracted.wantsToOpen) {
        message2 = `No — I couldn't find a customer named **${extracted.nameQuery}** in the system. Say "create a customer named ${extracted.nameQuery}" and I'll open the New Customer form for you.`;
      } else if (total === 0) {
        message2 = `No customers found${rangeLabel ? ` ${rangeLabel}` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : ""}.`;
      } else {
        const lines = customers
          .slice(0, 10)
          .map((c: any) => `• ${customerDisplayName(c)}${c.contact_details?.email ? ` — ${c.contact_details.email}` : ""} — created ${formatDate(c.createdAt)}`);
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Found **${total}** customer${total === 1 ? "" : "s"}${rangeLabel ? ` ${rangeLabel}` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // entity === "invoice"
    const query: any = { tenantId };
    let matchedCustomerId: string | undefined;
    let matchedCustomerName: string | undefined;
    if (extracted.nameQuery) {
      const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
      const cust: any = await Customer.findOne(
        { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
        "_id header",
      ).lean();
      if (cust) {
        matchedCustomerId = String(cust._id);
        matchedCustomerName = customerDisplayName(cust);
        query.customerId = matchedCustomerId;
      } else {
        // Not a known customer name — try it as an invoice number instead.
        query.number = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
      }
    }
    if (dateFromValid || dateToValid) {
      query.invoiceDate = {};
      if (dateFromValid) query.invoiceDate.$gte = new Date(dateFromValid);
      if (dateToValid) {
        const end = new Date(dateToValid);
        end.setHours(23, 59, 59, 999);
        query.invoiceDate.$lte = end;
      }
    }
    if (extracted.status) {
      if (extracted.status === "unpaid") {
        query.status = { $in: [SALES_INVOICE_STATUS.SAVED, SALES_INVOICE_STATUS.OVERDUE, SALES_INVOICE_STATUS.PARTIALLY_PAID] };
      } else if ((SALES_INVOICE_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }
    }

    const [total, invoices] = await Promise.all([
      SalesInvoice.countDocuments(query),
      (SalesInvoice as any)
        .find(query)
        .populate("customerId", "header")
        .sort({ invoiceDate: -1, createdAt: -1 })
        .limit(10)
        .lean(),
    ]);
    const totalAmount = total > 0 ? await SalesInvoice.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$totalAmount" } } }]) : [];
    const sumAmount = totalAmount[0]?.sum || 0;

    let route: string | undefined;
    if (extracted.wantsToOpen) {
      const params = new URLSearchParams();
      if (matchedCustomerId) params.set("customerId", matchedCustomerId);
      else if (extracted.nameQuery) params.set("search", extracted.nameQuery);
      if (dateFromValid) params.set("dateFrom", dateFromValid);
      if (dateToValid) params.set("dateTo", dateToValid);
      if (extracted.status) params.set("status", extracted.status);
      route = `/sales/invoices${params.toString() ? `?${params.toString()}` : ""}`;
    }

    const forWhom = matchedCustomerName ? ` for **${matchedCustomerName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
    let message2: string;
    if (total === 0) {
      message2 = `No — I couldn't find any invoices${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
    } else {
      const lines = invoices.slice(0, 10).map((inv: any) => {
        const custName = inv.customerId ? customerDisplayName(inv.customerId) : "Unknown customer";
        return `• ${inv.number} — ${custName} — ${formatCurrency(inv.totalAmount)} — ${String(inv.status).replace(/_/g, " ")} — ${formatDate(inv.invoiceDate)}`;
      });
      const more = total > 10 ? `\n…and ${total - 10} more.` : "";
      const openNote = route ? "\n\nOpening the filtered list for you now." : "";
      message2 = `Yes — found **${total}** invoice${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
    }

    return NextResponse.json({ success: true, handled: true, message: message2, route });
  } catch (error) {
    console.error("Sales AI memory-query error:", error);
    return NextResponse.json({ success: true, handled: false });
  }
}
