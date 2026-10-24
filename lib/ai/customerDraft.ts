import Customer from "@/models/sales/Customer";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { ErpToolError, escapeRegex, requireSalesAccess } from "./erpQuery";
import { normalizeErpText } from "./erpIntent";
import { AI_ACTION_STATUS as A } from "@/lib/constants/statuses";

type Scope = { tenantId: string; userId: string; role: string; conversationId: string };

export interface CustomerDraftParams {
  name?: string;
  is_company?: boolean;
  email?: string;
  phone?: string;
  mobile?: string;
  gstin?: string;
  pan?: string;
  currency?: string;
  conversationId: string;
  executing?: boolean;
}

export function validateCustomerPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s+-]/g, "");
  return /^\d{7,15}$/.test(cleaned);
}

export function validateCustomerEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateCustomerGstin(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase());
}

export function validateCustomerPan(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase());
}

export function extractCustomerFields(text: string): Partial<CustomerDraftParams> {
  const q = normalizeErpText(text).trim();
  const fields: Partial<CustomerDraftParams> = {};

  // Check customer type
  if (/\b(?:individual|person|sole\s+proprietor(?:ship)?)\b/i.test(q)) {
    fields.is_company = false;
  } else if (/\b(?:company|business|firm|enterprise|corporate|corp|pvt\s+ltd|ltd)\b/i.test(q)) {
    fields.is_company = true;
  }

  // Check email
  const emailMatch = q.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/);
  if (emailMatch) {
    fields.email = emailMatch[1].toLowerCase();
  }

  // Check phone / mobile
  const explicitPhone = q.match(/\b(?:phone|mobile|tel|contact(?:\s+number)?)\s*(?:is|:|=)?\s*([+0-9\s-]{1,25})/i);
  if (explicitPhone) {
    const raw = explicitPhone[1].trim();
    if (validateCustomerPhone(raw)) {
      fields.phone = raw;
      fields.mobile = raw;
    } else {
      throw new ErpToolError("BUSINESS_RULE", `Phone number "${raw}" is invalid. Please supply a valid 7–15 digit phone number.`);
    }
  } else {
    // Pure phone number (e.g. "123456788" or "+919876543210")
    const standaloneNum = q.match(/^\+?[0-9\s-]{7,18}$/);
    if (standaloneNum) {
      const raw = standaloneNum[0].trim();
      if (validateCustomerPhone(raw)) {
        fields.phone = raw;
        fields.mobile = raw;
      } else {
        throw new ErpToolError("BUSINESS_RULE", `Phone number "${raw}" is invalid. Please supply a valid 7–15 digit phone number.`);
      }
    }
  }

  // Check GSTIN
  const gstinMatch = q.match(/\bgstin\s*(?:is|:|=)?\s*([0-9A-Za-z]{15})\b/i);
  if (gstinMatch) {
    const raw = gstinMatch[1].toUpperCase();
    if (validateCustomerGstin(raw)) fields.gstin = raw;
    else throw new ErpToolError("BUSINESS_RULE", `GSTIN "${raw}" is invalid. GSTIN must be a valid 15-character Indian GST identifier.`);
  }

  // Check PAN
  const panMatch = q.match(/\bpan\s*(?:is|:|=)?\s*([0-9A-Za-z]{10})\b/i);
  if (panMatch) {
    const raw = panMatch[1].toUpperCase();
    if (validateCustomerPan(raw)) fields.pan = raw;
    else throw new ErpToolError("BUSINESS_RULE", `PAN "${raw}" is invalid. PAN must be a valid 10-character Indian PAN identifier.`);
  }

  // Check name
  const nameExplicit = q.match(/\b(?:names?|named|customer\s+names?|customer\s+named)\b\s*(?:is|:|=)?\s*([^,.\n]+?)(?=\s*(?:,|\band\b|\bwith\b|\bphone\b|\bemail\b|\btype\b|$))/i);
  if (nameExplicit) {
    fields.name = nameExplicit[1].trim().replace(/^['"]|['"]$/g, "");
  } else if (/\bcustomer\b/i.test(q)) {
    const afterCustomer = q.match(/\b(?:create|make|add|new|draft|prepare|register)\s+(?:an?\s+)?customer\s+(?:(?:named|names|name|called|for)\s+)?([^,.\n]+?)(?=\s*(?:,|\band\b|\bwith\b|\bphone\b|\bemail\b|\btype\b|$))/i);
    if (afterCustomer) {
      fields.name = afterCustomer[1].trim().replace(/^['"]|['"]$/g, "");
    }
  } else if (!fields.email && !fields.phone && fields.is_company === undefined && !q.includes("confirm") && !q.includes("cancel")) {
    // A standalone name string like "kishore k" or "Kishore Kumar"
    const cleaned = q.replace(/^name\s+(?:is\s+)?/i, "").trim().replace(/[.!]$/, "");
    if (/^[A-Za-z0-9\s.&'-]{2,80}$/.test(cleaned) && !/^(?:yes|no|confirm|save|cancel|show|list)$/i.test(cleaned)) {
      fields.name = cleaned;
    }
  }

  return fields;
}

export function customerDraftSummary(params: CustomerDraftParams): string {
  const typeStr = params.is_company === true ? "Company" : params.is_company === false ? "Individual" : "Not specified";
  const missing: string[] = [];
  if (!params.name) missing.push("customer name");
  if (params.is_company === undefined) missing.push("customer type (Individual or Company)");

  let msg = `Customer draft — not saved:\n\nName: ${params.name || "Missing"}\nType: ${typeStr}`;
  if (params.phone) msg += `\nPhone: ${params.phone}`;
  if (params.email) msg += `\nEmail: ${params.email}`;
  if (params.gstin) msg += `\nGSTIN: ${params.gstin}`;
  if (params.pan) msg += `\nPAN: ${params.pan}`;

  if (missing.length > 0) {
    msg += `\n\nMissing details: please provide ${missing.join(" and ")}.`;
  } else {
    msg += `\n\nConfirm customer to save, or cancel customer.`;
  }

  return msg;
}

export async function prepareCustomerDraft(scope: Scope, text: string, requestId: string) {
  requireSalesAccess(scope.role);
  const extracted = extractCustomerFields(text);
  const name = extracted.name || "";

  const params: CustomerDraftParams = {
    name,
    is_company: extracted.is_company,
    email: extracted.email,
    phone: extracted.phone,
    mobile: extracted.mobile,
    gstin: extracted.gstin,
    pan: extracted.pan,
    currency: "INR",
    conversationId: scope.conversationId,
  };

  const summary = customerDraftSummary(params);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  const proposal = await AiCommandProposal.create({
    tenantId: scope.tenantId,
    userId: scope.userId,
    module: "sales",
    actionType: "create_customer_draft",
    destructive: false,
    params,
    preview: { ...params },
    summary,
    status: A.PROPOSED,
    expiresAt,
  });

  const missingFields: string[] = [];
  if (!params.name) missingFields.push("name");
  if (params.is_company === undefined) missingFields.push("type");

  return {
    proposalId: String(proposal._id),
    name: params.name,
    isCompany: params.is_company,
    phone: params.phone,
    email: params.email,
    missingFields,
    message: summary,
  };
}

export async function updateCustomerDraft(scope: Scope, proposalId: string, text: string, requestId: string) {
  requireSalesAccess(scope.role);
  const proposal = await AiCommandProposal.findOne({
    _id: proposalId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    status: A.PROPOSED,
    "params.executing": { $ne: true },
  });

  if (!proposal) throw new ErpToolError("NOT_FOUND", "No active customer draft found in this conversation.");

  const currentParams = (proposal.params || {}) as unknown as CustomerDraftParams;
  const extracted = extractCustomerFields(text);

  const updatedParams: CustomerDraftParams = {
    ...currentParams,
    ...(extracted.name ? { name: extracted.name } : {}),
    ...(extracted.is_company !== undefined ? { is_company: extracted.is_company } : {}),
    ...(extracted.email ? { email: extracted.email } : {}),
    ...(extracted.phone ? { phone: extracted.phone, mobile: extracted.mobile || extracted.phone } : {}),
    ...(extracted.gstin ? { gstin: extracted.gstin } : {}),
    ...(extracted.pan ? { pan: extracted.pan } : {}),
  };

  const summary = customerDraftSummary(updatedParams);
  proposal.params = updatedParams as unknown as Record<string, unknown>;
  proposal.preview = { ...updatedParams } as unknown as Record<string, unknown>;
  proposal.summary = summary;
  await proposal.save();

  const missingFields: string[] = [];
  if (!updatedParams.name) missingFields.push("name");
  if (updatedParams.is_company === undefined) missingFields.push("type");

  return {
    proposalId: String(proposal._id),
    name: updatedParams.name,
    isCompany: updatedParams.is_company,
    phone: updatedParams.phone,
    email: updatedParams.email,
    missingFields,
    message: summary,
  };
}

export async function confirmCustomerDraft(scope: Scope, proposalId: string) {
  requireSalesAccess(scope.role);
  const proposal = await AiCommandProposal.findOne({
    _id: proposalId,
    tenantId: scope.tenantId,
    userId: scope.userId,
  });

  if (!proposal) throw new ErpToolError("NOT_FOUND", "Customer draft not found.");

  // Idempotency check: if already executed, return existing persisted customer
  if (proposal.status === A.EXECUTED && proposal.resultRef) {
    const existing = await Customer.findOne({ _id: proposal.resultRef, tenantId: scope.tenantId }).lean();
    if (existing) {
      return {
        customerId: String(existing._id),
        name: (existing as any).header?.name,
        isCompany: (existing as any).header?.is_company,
        route: "/sales/customers",
      };
    }
  }

  if (proposal.status !== A.PROPOSED) {
    throw new ErpToolError("BUSINESS_RULE", `This customer draft is ${proposal.status} and cannot be saved.`);
  }

  // Atomic execution lock
  const locked = await AiCommandProposal.findOneAndUpdate(
    { _id: proposalId, status: A.PROPOSED, "params.executing": { $ne: true } },
    { $set: { "params.executing": true } },
    { new: true }
  );

  if (!locked) {
    const latest = await AiCommandProposal.findById(proposalId).lean();
    if (latest?.status === A.EXECUTED && latest?.resultRef) {
      const existing = await Customer.findOne({ _id: latest.resultRef, tenantId: scope.tenantId }).lean();
      if (existing) {
        return {
          customerId: String(existing._id),
          name: (existing as any).header?.name,
          isCompany: (existing as any).header?.is_company,
          route: "/sales/customers",
        };
      }
    }
    throw new ErpToolError("BUSINESS_RULE", "This customer creation is already being processed.");
  }

  const params = (locked.params || {}) as unknown as CustomerDraftParams;
  if (!params.name || !params.name.trim()) {
    await AiCommandProposal.updateOne({ _id: proposalId }, { $unset: { "params.executing": "" } });
    throw new ErpToolError("MISSING_FIELD", "Please provide a customer name before saving.");
  }

  const isCompany = params.is_company ?? false;
  const name = params.name.trim();

  // Create real customer
  const doc = await Customer.create({
    tenantId: scope.tenantId,
    createdBy: scope.userId,
    header: {
      name,
      is_company: isCompany,
      displayName: name,
      firstName: !isCompany ? name.split(" ")[0] : undefined,
      lastName: !isCompany ? (name.split(" ").slice(1).join(" ") || undefined) : undefined,
      companyName: isCompany ? name : undefined,
    },
    contact_details: {
      email: params.email || undefined,
      phone: params.phone || undefined,
      mobile: params.mobile || params.phone || undefined,
    },
    gstin: params.gstin || undefined,
    pan: params.pan || undefined,
    currency: params.currency || "INR",
  });

  await CrmAuditLog.create({
    tenantId: scope.tenantId,
    user_id: scope.userId,
    action: "created",
    record_type: "Customer",
    record_id: doc._id,
    new_value: `${name} (${isCompany ? "Company" : "Individual"})`,
  });

  locked.status = A.EXECUTED;
  locked.resultRef = String(doc._id);
  locked.executedAt = new Date();
  await locked.save();

  return {
    customerId: String(doc._id),
    name: doc.header.name,
    isCompany: doc.header.is_company,
    route: "/sales/customers",
  };
}

export async function cancelCustomerDraft(scope: Scope, proposalId: string) {
  requireSalesAccess(scope.role);
  await AiCommandProposal.updateOne(
    { _id: proposalId, tenantId: scope.tenantId, userId: scope.userId, status: A.PROPOSED, "params.executing": { $ne: true } },
    { $set: { status: A.REJECTED } }
  );
  return "Customer draft cancelled. No customer record was created.";
}
