import connectDB from "@/lib/db";
import { SalesInvoice } from "@/models/SalesInvoice";
import { DocumentSettings } from "@/models/DocumentSettings";
import Organization from "@/models/Organization";
import "@/models/BankAccount";
import "@/models/Customer";
import {
  getTemplateDefinition,
  renderInvoiceTemplate,
  renderInvoiceTemplateFragment,
  buildTemplateContext,
} from "@/lib/invoiceTemplates";

/**
 * Shared invoice → HTML renderer (Phase 5). Extracted from the authenticated
 * PDF route so the public signed-link route (used by WhatsApp sharing) can
 * render the exact same output without duplicating the logic. Tenant scoping
 * is the caller's responsibility: the authenticated route passes the session
 * tenantId; the public route derives it from the signed token / invoice doc
 * (authorization there comes from the HMAC-signed link, not the session).
 */
export async function renderInvoiceHtmlById(opts: {
  invoiceId: string;
  tenantId: string;
  templateKeyOverride?: string | null;
  fallbackCompanyName?: string;
  embed?: boolean;
}): Promise<{ ok: true; html: string; orientation?: string } | { ok: false; status: number; message: string }> {
  await connectDB();

  const invoice = await (SalesInvoice as any)
    .findOne({ _id: opts.invoiceId, tenantId: opts.tenantId })
    .populate("customerId")
    .populate("bankAccountId")
    .lean();

  if (!invoice) return { ok: false, status: 404, message: "Invoice not found" };

  const [settingsDoc, org] = await Promise.all([
    (DocumentSettings as any).findOne({ tenantId: opts.tenantId }).lean(),
    Organization.findOne({ subdomain: opts.tenantId }).lean(),
  ]);

  const templateKey = opts.templateKeyOverride || invoice.templateKey || "modern";
  const def = getTemplateDefinition(templateKey);

  const orgSettings = (org as any)?.settings || {};
  const companyAddress = [orgSettings.addressLine1, orgSettings.addressLine2, orgSettings.city, orgSettings.pincode]
    .filter(Boolean)
    .join(", ");

  let bank = null;
  if (invoice.bankAccountId) {
    bank = {
      accountName: invoice.bankAccountId.accountName,
      accountNumber: invoice.bankAccountId.accountNumber,
      bankName: invoice.bankAccountId.bankName,
      ifsc: invoice.bankAccountId.ifsc,
      upiId: invoice.bankAccountId.upiId,
    };
  }

  let signatureUrl: string | null = null;
  if (invoice.signatureId && settingsDoc?.signatures?.length) {
    const sig = settingsDoc.signatures.find((s: any) => String(s._id) === String(invoice.signatureId));
    signatureUrl = sig?.imageUrl || null;
  }

  const ctx = await buildTemplateContext({
    invoice,
    settingsDoc,
    company: {
      name: (org as any)?.name || opts.fallbackCompanyName || "Your Company",
      gstin: orgSettings.gstin,
      logo: orgSettings.logo,
      address: companyAddress,
      state: orgSettings.state,
    },
    bank,
    signatureUrl,
    documentType: "invoice",
  });

  if (opts.embed) {
    return { ok: true, html: renderInvoiceTemplateFragment(def, ctx), orientation: def.orientation };
  }
  return { ok: true, html: renderInvoiceTemplate(def, ctx) };
}
