/**
 * Ad-hoc verification: renders every seeded default-tenant invoice through
 * the real template engine (same code path as the PDF route) and reports
 * any template that throws or produces suspiciously empty output. Not a
 * substitute for the vitest suite — this exercises live seeded Mongo data.
 *
 * Usage: npx tsx scripts/verify-invoice-pdfs.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import { SalesInvoice } from "../models/SalesInvoice";
import { DocumentSettings } from "../models/DocumentSettings";
import Organization from "../models/Organization";
import "../models/Customer";
import "../models/BankAccount";
import { getTemplateDefinition, renderInvoiceTemplate, renderInvoiceTemplateFragment, buildTemplateContext, ACTIVE_TEMPLATE_KEYS } from "../lib/invoiceTemplates";

const TENANT_ID = "default-tenant";

async function main() {
  await connectDB();
  const invoices = await (SalesInvoice as any)
    .find({ tenantId: TENANT_ID })
    .populate("customerId")
    .populate("bankAccountId")
    .sort({ number: 1 })
    .lean();

  const [settingsDoc, org] = await Promise.all([
    (DocumentSettings as any).findOne({ tenantId: TENANT_ID }).lean(),
    Organization.findOne({ subdomain: TENANT_ID }).lean(),
  ]);

  const orgSettings = (org as any)?.settings || {};
  const companyAddress = [orgSettings.addressLine1, orgSettings.addressLine2].filter(Boolean).join(", ");

  let failures = 0;
  for (const invoice of invoices) {
    const templateKey = invoice.templateKey || "modern";
    try {
      const def = getTemplateDefinition(templateKey);

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
        company: { name: (org as any)?.name || "Aupulens Corporate HQ", gstin: orgSettings.gstin, address: companyAddress, state: orgSettings.state },
        bank,
        signatureUrl,
        documentType: "invoice",
      });

      const html = renderInvoiceTemplate(def, ctx);
      const fragment = renderInvoiceTemplateFragment(def, ctx);
      const fragmentMatchesPdf = html.includes(fragment.trim());
      const hasGst = /CGST|SGST|IGST/.test(html);
      const hasTotal = html.includes(String(Math.round(invoice.totalAmount)));
      const ok = html.length > 500 && hasGst && fragmentMatchesPdf;
      console.log(
        `${ok ? "OK  " : "WARN"} ${invoice.number.padEnd(10)} template=${templateKey.padEnd(14)} len=${html.length}  gstMarkersPresent=${hasGst}  totalPresent=${hasTotal}  previewMatchesPdf=${fragmentMatchesPdf}`,
      );
      if (!ok) failures++;
    } catch (err: any) {
      failures++;
      console.error(`FAIL ${invoice.number} template=${templateKey}:`, err.message);
    }
  }

  const seededTemplateKeys = new Set(invoices.map((i: any) => i.templateKey));
  const missing = ACTIVE_TEMPLATE_KEYS.filter((k) => !seededTemplateKeys.has(k));
  console.log(`\nActive templates: ${ACTIVE_TEMPLATE_KEYS.length} (${ACTIVE_TEMPLATE_KEYS.join(", ")})`);
  if (missing.length) {
    console.error(`MISSING seed coverage for: ${missing.join(", ")}`);
    failures++;
  } else {
    console.log("Every active template has at least one seeded invoice.");
  }

  console.log(`\n${invoices.length - failures}/${invoices.length} checks passed.`);
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
