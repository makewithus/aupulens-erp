import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { extractAttachment } from "@/lib/ai/extractFile";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import CrmAccount from "@/models/crm/Account";
import CrmOpportunity from "@/models/crm/Opportunity";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * AI form pre-fill extractor.
 *
 * Given a natural-language instruction and/or attached image(s), extract the
 * fields needed to pre-fill a real create form, plus short data-quality
 * suggestions. This does NOT write anything — the client stashes the result and
 * navigates to the actual form, where the user reviews and clicks Create.
 *
 * To add a new entity: add an entry to TARGETS with its route + field spec, and
 * make that page consume the prefill (lib/ai/aiPrefill.ts `consumePrefill`).
 */
const TARGETS: Record<string, { route: string; label: string; spec: string }> = {
  lead: {
    route: "/crm/leads",
    label: "CRM lead",
    spec: `Fields (JSON keys): lead_name (the person's name — REQUIRED), company_name, email, phone, source, priority, industry, location, notes, next_followup_date.
- "source" MUST be exactly one of: Organic Search, Paid Ads, Referral, Event, Social Media, Direct Website, Outbound Calling, Partner Channel, Repeat Customer, Website Form, WhatsApp, Email Import, CSV Import, Chatbot, Manual Entry, Other. If the source isn't clear, use "Manual Entry".
- "priority" MUST be exactly one of: Low, Medium, High. Default to "Medium".
- "next_followup_date" as YYYY-MM-DD (convert any date format you see).`,
  },
  customer: {
    route: "/sales/customers/new",
    label: "customer",
    spec: `Fields (JSON keys): name (the customer or company name — REQUIRED), is_company (boolean: true for a business, false for an individual), salutation, companyName, firstName, lastName, email, phone, mobile, gstin, pan, currency.
- If it's clearly a company, set is_company=true and put the company name in both "name" and "companyName". If it's an individual, set is_company=false and fill firstName/lastName.
- "gstin" is a 15-character Indian GST number (uppercase). "pan" is a 10-character Indian PAN (uppercase).
- "currency" defaults to "INR" if not stated.`,
  },
  employee: {
    route: "/hr/employees",
    label: "employee",
    spec: `Fields (JSON keys): firstName (REQUIRED), lastName (REQUIRED), email (REQUIRED), phone (REQUIRED), employeeCode, designation, gender, dateOfJoining, employmentType.
- "gender" MUST be one of: male, female, other (lowercase) — or "".
- "employmentType" MUST be one of: full-time, part-time, contract, intern. Default "full-time".
- "dateOfJoining" as YYYY-MM-DD.`,
  },
  invoice: {
    route: "/sales/invoices/new",
    label: "invoice",
    spec: `Fields (JSON keys): customerName (the bill-to customer/company name — REQUIRED), reference, invoiceDate, dueDate, notes, lineItems.
- "lineItems" is an ARRAY of objects: { name (item name/description — REQUIRED), qty (number, default 1), unitPrice (number, no currency symbol), taxRate (GST percent as a plain number, e.g. 18), hsn }.
- Extract every line item you can find in the document/instruction. Dates as YYYY-MM-DD.`,
  },
  contact: {
    route: "/crm/contacts",
    label: "CRM contact",
    spec: `Fields (JSON keys): first_name (REQUIRED), last_name, email, mobile, designation, department, role_in_buying, preferred_communication.
- Split a full name into first_name + last_name. Keep phone/mobile with country code.
- "role_in_buying" MUST be exactly one of: Decision Maker, Influencer, Finance Contact, Technical Contact, Procurement, Support Contact, Executive Sponsor, End User — or "" if unclear.
- "preferred_communication" MUST be exactly one of: Email, Phone, WhatsApp, Meeting — or "" if unclear. Never guess.`,
  },
  account: {
    route: "/crm/accounts",
    label: "CRM account (company)",
    spec: `Fields (JSON keys): company_name (REQUIRED), website, industry.`,
  },
  case: {
    route: "/crm/cases",
    label: "support case",
    spec: `Fields (JSON keys): title (REQUIRED), description, category, subcategory, severity, status.
- "severity" one of: Low, Medium, High (default Low). "status" default "New".`,
  },
  project: {
    route: "/projects",
    label: "project",
    spec: `Fields (JSON keys): name (REQUIRED), description, status, priority, dueDate.
- "priority" one of: Low, Medium, High (default Medium). "dueDate" as YYYY-MM-DD.`,
  },
  opportunity: {
    route: "/crm/opportunities",
    label: "sales opportunity/deal",
    spec: `Fields (JSON keys): deal_name (REQUIRED), amount, expected_close_date, stage, priority, forecast_category, source, product_service_line, next_action.
- "amount" as a plain number. "expected_close_date" as YYYY-MM-DD. "priority" one of Low/Medium/High.
- "stage" MUST be exactly one of: Prospecting, Discovery, Requirement Gathering, Solution Fit, Proposal Sent, Negotiation, Approval, Closed Won, Closed Lost. Map any similar phrase to the closest of these (e.g. a "proposal"/"price quote" stage → "Proposal Sent"). If unclear, use "Prospecting".
- "forecast_category" MUST be exactly one of: Omitted, Pipeline, Best Case, Commit, Closed — or "" if unclear.`,
  },
  quote: {
    route: "/crm/quotes/new",
    label: "sales quote",
    spec: `Fields (JSON keys): quote_number, account_name (the customer/company the quote is FOR), opportunity_name (the deal/opportunity it relates to, if any), validity_date, notes, terms_and_conditions, line_items.
- "line_items" is an ARRAY of objects: { item_name (REQUIRED), description, quantity (number, default 1), unit_price (number, no currency symbol), discount_percent (number 0-100, default 0), tax_percent (GST percent as a plain number, e.g. 18, default 18) }.
- Extract EVERY line item you can find in the document/instruction, in order. "validity_date" as YYYY-MM-DD. Amounts and percents as plain numbers (no ₹, %, or commas).`,
  },
};

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!session || !tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const target: string = body.target;
    const message: string = body.message || "";
    const def = TARGETS[target];
    if (!def) return NextResponse.json({ success: false, message: `Unsupported target: ${target}` }, { status: 400 });

    const rawAtts: any[] = Array.isArray(body.attachments) ? body.attachments : (body.attachment ? [body.attachment] : []);
    const imageUrls: string[] = [];
    const docTexts: string[] = [];
    for (const a of rawAtts.slice(0, 8)) {
      if (!a?.dataUrl || !a?.type) continue;
      if (String(a.type).startsWith("image/")) {
        imageUrls.push(a.dataUrl);
        continue;
      }
      // PDF / DOCX / TXT / CSV → extract the text so the AI can read the document
      // (previously only images were read, so a document attachment yielded a
      // blank form). Best-effort — a failed read just contributes no text.
      try {
        const base64 = a.dataUrl.includes(",") ? a.dataUrl.split(",")[1] : a.dataUrl;
        const buffer = Buffer.from(base64, "base64");
        const extracted = await extractAttachment(buffer, a.type, a.name || "");
        if (extracted.kind === "text" && (extracted as any).text) {
          docTexts.push(`=== ${a.name || "document"} ===\n${(extracted as any).text}`);
        } else if (extracted.kind === "image" && (extracted as any).imageDataUrl) {
          imageUrls.push((extracted as any).imageDataUrl);
        }
      } catch { /* unreadable file — skip, others may still have data */ }
    }
    const imageSlice = imageUrls.slice(0, 6);

    // Recent conversation — lets us reuse details already given/analysed earlier
    // (e.g. "create the lead with those details" after an attachment was read).
    const history: { role: string; content: string }[] = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const historyBlock = history.length
      ? `\n\nRecent conversation (use any relevant details from here too):\n${history.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n").slice(0, 4000)}`
      : "";

    const docsBlock = docTexts.length
      ? `\n\nAttached document content (extract the fields from here):\n${docTexts.join("\n\n").slice(0, 12000)}`
      : "";

    const prompt = `You are extracting fields to pre-fill a ${def.label} form in an ERP. Read the user's instruction, any attached image(s), the attached document text, AND the recent conversation, then return ONLY JSON (no markdown, no prose) in this exact shape:
{"data": { ...fields... }, "suggestions": ["short tip", ...]}

${def.spec}

Rules:
- Fill only fields you can determine from the instruction, images, or document. Leave the rest as "".
- Do NOT invent values that aren't present in the inputs.
- SMART PARSING — split/normalise composite values into the correct fields:
  • Names with a title: put the title (Mr, Mrs, Ms, Miss, Dr, Prof, etc.) in "salutation" if that field exists, the given name in "firstName", and the family name in "lastName". Keep the full readable name in "name"/"lead_name" too.
  • Phone/mobile numbers: keep them EXACTLY as given INCLUDING any country code (e.g. "+91 98765 43210") — never drop the country code.
  • Dates → YYYY-MM-DD. Amounts → plain numbers (no currency symbols or commas). GSTIN/PAN → uppercase.
- "suggestions" = 0-4 SHORT, genuinely useful data-quality checks for the user to verify before saving — e.g. "Phone number looks too short", "Company name usually ends with 'Pvt Ltd'", "Email domain doesn't match the company name". Only include real issues you actually notice; use [] if there are none.

User instruction: "${message}"${docsBlock}${historyBlock}`;

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      maxTokens: 700,
      imageDataUrls: imageSlice.length ? imageSlice : undefined,
    });

    // strictNullChecks off — narrow on "text" in result.
    if (!("text" in result)) {
      return NextResponse.json({ success: false, message: result.error, code: result.code }, { status: 403 });
    }

    let parsed: any;
    try {
      const m = result.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : result.text);
    } catch {
      return NextResponse.json({ success: false, message: "I couldn't read those details clearly. Please add a bit more detail and try again." }, { status: 422 });
    }

    const data = parsed?.data && typeof parsed.data === "object" ? parsed.data : {};
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 4)
      : [];

    // ── Cross-entity dependency resolution ───────────────────────────────────
    // An invoice needs a customer. Resolve the named customer to a real id; if
    // there's no match, flag it so the UI can tell the user to create the
    // customer first (the invoice form has an inline "+ customer" for this).
    let missingDependency: { type: string; name: string } | undefined;
    if (target === "invoice") {
      const nameQ = String(data.customerName || "").trim();
      if (nameQ) {
        await connectDB();
        const rx = new RegExp(`^${escapeRegex(nameQ)}$`, "i");
        const cust: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id",
        ).lean();
        if (cust) {
          data.customerId = String(cust._id);
        } else {
          missingDependency = { type: "customer", name: nameQ };
          suggestions.unshift(`No customer named "${nameQ}" exists yet — create them first (use the "+" on the customer field), then select them.`);
        }
      }
    }

    // A quote needs an Account (and usually an Opportunity). Resolve the named
    // account/opportunity to real ids so the form's selects are pre-picked; if a
    // name was given but not found, flag it so the user knows to create/select it.
    if (target === "quote") {
      await connectDB();
      const accQ = String(data.account_name || "").trim();
      if (accQ) {
        const rx = new RegExp(`^${escapeRegex(accQ)}$`, "i");
        const acc: any = await CrmAccount.findOne({ tenantId, company_name: rx }, "_id").lean();
        if (acc) data.account_id = String(acc._id);
        else {
          missingDependency = { type: "account", name: accQ };
          suggestions.unshift(`No account named "${accQ}" exists yet — create it (CRM → Accounts) or pick a different account, then select it here.`);
        }
      }
      const oppQ = String(data.opportunity_name || "").trim();
      if (oppQ) {
        const rx = new RegExp(`^${escapeRegex(oppQ)}$`, "i");
        const opp: any = await CrmOpportunity.findOne({ tenantId, deal_name: rx }, "_id").lean();
        if (opp) data.opportunity_id = String(opp._id);
        else suggestions.unshift(`No opportunity named "${oppQ}" was found — pick the right one in the Opportunity field.`);
      }
    }

    return NextResponse.json({ success: true, target, route: def.route, data, suggestions, missingDependency });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
