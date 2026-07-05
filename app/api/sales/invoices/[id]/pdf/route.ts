import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import { SalesInvoice } from "@/models/SalesInvoice";
import { DocumentSettings } from "@/models/DocumentSettings";
import Organization from "@/models/Organization";
import "@/models/BankAccount"; // side-effect import: registers "BankAccount" for .populate("bankAccountId") below
import "@/models/Customer"; // side-effect import: registers "Customer" for .populate("customerId") below
import { getTemplateDefinition, renderInvoiceTemplate, renderInvoiceTemplateFragment, buildTemplateContext } from "@/lib/invoiceTemplates";

// Server-side, tenant-scoped, print-quality A4 HTML rendered for the browser's
// native print pipeline (vector text, correct margins, crisp fonts). We chose
// HTML + browser print-to-PDF over a headless-Chromium/puppeteer route: this
// sandboxed build/runtime environment has no verified Chromium binary
// available, so a puppeteer dependency would be fragile at best. Browser
// print-to-PDF already produces genuinely vector, print-quality A4 output
// without that runtime risk. pdf-lib (used elsewhere in the app) is a
// low-level byte-drawing API poorly suited to these dense, wrapping,
// settings-driven tax-invoice tables.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;

    const invoice = await (SalesInvoice as any)
      .findOne({ _id: id, tenantId })
      .populate("customerId")
      .populate("bankAccountId")
      .lean();

    if (!invoice) {
      return new NextResponse("Invoice not found", { status: 404 });
    }

    const [settingsDoc, org] = await Promise.all([
      (DocumentSettings as any).findOne({ tenantId }).lean(),
      Organization.findOne({ subdomain: tenantId }).lean(),
    ]);

    const { searchParams } = new URL(request.url);
    const templateKeyOverride = searchParams.get("templateId");
    const templateKey = templateKeyOverride || invoice.templateKey || "modern";
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
        name: (org as any)?.name || session.user.name || "Your Company",
        gstin: orgSettings.gstin,
        logo: orgSettings.logo,
        address: companyAddress,
        state: orgSettings.state,
      },
      bank,
      signatureUrl,
      documentType: "invoice",
    });

    // `?embed=1` returns the same content as a JSON-wrapped HTML fragment
    // instead of a full document — used by the invoice detail page to show
    // an in-page preview via dangerouslySetInnerHTML rather than an
    // <iframe>, which this app's CSP (`frame-ancestors 'none'`) blocks even
    // same-origin. Direct download/new-tab/print still use the full
    // document below, unaffected by CSP since that's navigation, not framing.
    if (searchParams.get("embed") === "1") {
      const html = renderInvoiceTemplateFragment(def, ctx);
      return NextResponse.json({ success: true, data: { html, orientation: def.orientation } });
    }

    const html = renderInvoiceTemplate(def, ctx);

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error: any) {
    console.error("PDF generation error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}
