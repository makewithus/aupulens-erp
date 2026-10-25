import Customer from "@/models/sales/Customer";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { ErpToolError, escapeRegex, requireSalesAccess } from "./erpQuery";
import { normalizeErpText } from "./erpIntent";
import { AI_ACTION_STATUS as A } from "@/lib/constants/statuses";

import { isValidPhone, isValidEmail } from "@/lib/sales/customerValidation";

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
  clearPhone?: boolean;
}

export function validateCustomerPhone(phone?: string | null): boolean {
  if (!phone || !phone.trim()) return true;
  return isValidPhone(phone);
}

export function validateCustomerEmail(email?: string | null): boolean {
  if (!email || !email.trim()) return true;
  return isValidEmail(email);
}

export function validateCustomerGstin(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase());
}

export function validateCustomerPan(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase());
}

export function extractCustomerFieldsWithErrors(text: string): {
  fields: Partial<CustomerDraftParams> & { clearPhone?: boolean };
  errors: string[];
} {
  const q = normalizeErpText(text).trim();
  const fields: Partial<CustomerDraftParams> & { clearPhone?: boolean } = {};
  const errors: string[] = [];

  // 1. Customer type
  if (/\b(?:individual|person|sole\s+proprietor(?:ship)?)\b/i.test(q)) {
    fields.is_company = false;
  } else if (
    /\b(?:type\s*(?:is|to|:|=)\s*company|customer\s+type\s*(?:is|to|:|=)\s*company|company\s+customer)\b/i.test(q) ||
    (/\b(?:company|business|firm|enterprise|corporate|corp|pvt\s+ltd|ltd)\b/i.test(q) && !/\bindividual\b/i.test(q))
  ) {
    fields.is_company = true;
  }

  // 2. Email
  const emailMatch = q.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/);
  if (emailMatch) {
    const rawEmail = emailMatch[1].toLowerCase();
    if (isValidEmail(rawEmail)) {
      fields.email = rawEmail;
    } else {
      errors.push(`Email "${rawEmail}" is invalid. Please supply a valid email address.`);
    }
  }

  // 3. Phone clearing instruction vs phone value
  const clearPhone = /\b(?:leave|keep|set)?\s*(?:the\s+)?(?:phone|mobile|contact)(?:\s+number)?\s*(?:is\s+|to\s+|as\s+)?(?:empty|blank|none|clear|null)\b|\b(?:clear|remove|delete|omit)\s+(?:the\s+)?(?:phone|mobile|contact)(?:\s+number)?\b|\bwithout\s+(?:a\s+)?(?:phone|mobile|contact)(?:\s+number)?\b|\bno\s+(?:phone|mobile|contact)(?:\s+number)?\b/i.test(q);
  if (clearPhone) {
    fields.phone = "";
    fields.mobile = "";
    fields.clearPhone = true;
  } else {
    // Explicit phone keyword
    const explicitPhone = q.match(/\b(?:(?:phone|mobile|tel|contact)(?:\s+number)?)\s*(?:is|to|:|=)?\s*([+]?[0-9][0-9\s-]*[0-9]|[0-9]+|[a-zA-Z0-9_+.-]+)/i);
    if (explicitPhone) {
      const raw = explicitPhone[1].trim();
      if (isValidPhone(raw)) {
        fields.phone = raw;
        fields.mobile = raw;
      } else {
        errors.push(`Phone number "${raw}" is invalid. Please supply a valid 7–15 digit phone number.`);
      }
    } else {
      // Standalone or list phone number
      const standalone = q.match(/(?:^|\b|\band\s+)(\+?[0-9][0-9\s-]{5,18}[0-9]|\+?[0-9]{7,18})(?:[.,;!]|\s*(?:and|with|$))/i);
      if (standalone && !fields.clearPhone) {
        const raw = standalone[1].trim();
        if (isValidPhone(raw)) {
          fields.phone = raw;
          fields.mobile = raw;
        } else {
          errors.push(`Phone number "${raw}" is invalid. Please supply a valid 7–15 digit phone number.`);
        }
      }
    }
  }

  // 4. GSTIN
  const gstinMatch = q.match(/\bgstin\s*(?:is|to|:|=)?\s*([0-9A-Za-z]{15})\b/i);
  if (gstinMatch) {
    const raw = gstinMatch[1].toUpperCase();
    if (validateCustomerGstin(raw)) fields.gstin = raw;
    else errors.push(`GSTIN "${raw}" is invalid. GSTIN must be a valid 15-character Indian GST identifier.`);
  }

  // 5. PAN
  const panMatch = q.match(/\bpan\s*(?:is|to|:|=)?\s*([0-9A-Za-z]{10})\b/i);
  if (panMatch) {
    const raw = panMatch[1].toUpperCase();
    if (validateCustomerPan(raw)) fields.pan = raw;
    else errors.push(`PAN "${raw}" is invalid. PAN must be a valid 10-character Indian PAN identifier.`);
  }

  // 6. Name
  // A. 'change/update the name from X to Y'
  const changeFromTo = q.match(/\b(?:change|update)\s+(?:the\s+)?(?:customer\s+)?names?\s+from\s+[^,.\n]+?\s+to\s+([^,.\n]+?)(?=[.,;!]|\s*(?:,|\band\b|\bwith\b|\bphone\b|\bemail\b|\btype\b|$))/i);
  if (changeFromTo) {
    fields.name = changeFromTo[1].trim().replace(/^['"]|['"]$/g, "");
  } else {
    // B. 'set/change/update name to Y' or 'name is/as/:/= Y'
    const nameToOrIs = q.match(/\b(?:(?:customer\s+)?names?|named)\s*(?:is|to|:|as|=)\s*([^,.\n]+?)(?=[.,;!]|\s*(?:,|\band\b|\bwith\b|\bphone\b|\bemail\b|\btype\b|$))/i);
    if (nameToOrIs) {
      fields.name = nameToOrIs[1].trim().replace(/^['"]|['"]$/g, "");
    } else {
      // C. 'customer named/names/called X' or 'create customer [named] X'
      const custNamed = q.match(/\b(?:create|make|add|new|draft|prepare|register)\s+(?:an?\s+)?customer\s+(?:(?:named|names|name|called|for)\s+)?([^,.\n]+?)(?=[.,;!]|\s*(?:,|\band\b|\bwith\b|\bphone\b|\bemail\b|\btype\b|$))/i);
      if (custNamed) {
        const candidate = custNamed[1].trim().replace(/^['"]|['"]$/g, "");
        if (!/^(?:draft|record|profile|account)$/i.test(candidate)) {
          fields.name = candidate;
        }
      } else {
        // D. 'with [Name], [Type], and [Phone]'
        const withList = q.match(/\bwith\s+([A-Za-z0-9\s.&'-]+?)(?=\s*,\s*(?:individual|company|[0-9])|\s+and\s+[0-9]|\s*(?:,|\band\b)\s*(?:individual|company))/i);
        if (withList) {
          fields.name = withList[1].trim().replace(/^['"]|['"]$/g, "");
        } else if (!fields.email && !fields.phone && fields.is_company === undefined && !fields.clearPhone && !q.includes("confirm") && !q.includes("cancel")) {
          // E. Standalone name string (e.g. "kishore k" or "Kishore Kumar")
          const isKeywordOnly = /\b(?:type|phone|mobile|email|gstin|pan|draft|confirm|cancel|save|delete|leave|show|list)\b/i.test(q);
          if (!isKeywordOnly) {
            const cleaned = q.replace(/^name\s+(?:is\s+|to\s+)?/i, "").trim().replace(/[.!]$/, "");
            if (/^[A-Za-z0-9\s.&'-]{2,80}$/.test(cleaned) && !/^(?:yes|no|confirm|save|cancel|show|list|individual|company|update)$/i.test(cleaned) && !/^\+?[0-9\s-]{7,25}$/.test(cleaned)) {
              fields.name = cleaned;
            }
          }
        }
      }
    }
  }

  return { fields, errors };
}

export function extractCustomerFields(text: string): Partial<CustomerDraftParams> & { clearPhone?: boolean } {
  return extractCustomerFieldsWithErrors(text).fields;
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
  const { fields: extracted, errors } = extractCustomerFieldsWithErrors(text);
  const name = extracted.name || "";

  const params: CustomerDraftParams = {
    name,
    is_company: extracted.is_company,
    email: extracted.email,
    phone: extracted.clearPhone ? undefined : extracted.phone,
    mobile: extracted.clearPhone ? undefined : (extracted.mobile || extracted.phone),
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

  if (errors.length > 0) {
    throw new ErpToolError("BUSINESS_RULE", errors[0]);
  }

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
  const { fields: extracted, errors } = extractCustomerFieldsWithErrors(text);

  const updatedParams: CustomerDraftParams = {
    ...currentParams,
    ...(extracted.name ? { name: extracted.name } : {}),
    ...(extracted.is_company !== undefined ? { is_company: extracted.is_company } : {}),
    ...(extracted.email ? { email: extracted.email } : {}),
    ...(extracted.phone ? { phone: extracted.phone, mobile: extracted.mobile || extracted.phone } : {}),
    ...(extracted.gstin ? { gstin: extracted.gstin } : {}),
    ...(extracted.pan ? { pan: extracted.pan } : {}),
  };

  if (extracted.clearPhone) {
    delete updatedParams.phone;
    delete updatedParams.mobile;
  }

  const summary = customerDraftSummary(updatedParams);
  proposal.params = updatedParams as unknown as Record<string, unknown>;
  proposal.preview = { ...updatedParams } as unknown as Record<string, unknown>;
  proposal.summary = summary;
  await proposal.save();

  // If there are validation errors (e.g. invalid phone number), raise them now AFTER saving valid fields
  if (errors.length > 0) {
    throw new ErpToolError("BUSINESS_RULE", errors[0]);
  }

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

  if (params.is_company === undefined) {
    await AiCommandProposal.updateOne({ _id: proposalId }, { $unset: { "params.executing": "" } });
    throw new ErpToolError("MISSING_FIELD", "Please specify customer type (Individual or Company) before saving.");
  }

  const isCompany = params.is_company;
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
