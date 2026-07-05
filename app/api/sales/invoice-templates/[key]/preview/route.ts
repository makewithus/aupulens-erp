import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import { DocumentSettings } from "@/models/DocumentSettings";
import Organization from "@/models/Organization";
import { getTemplateDefinition, renderInvoiceTemplateFragment, buildTemplateContext } from "@/lib/invoiceTemplates";

// Sample data only — no real customer/tenant business data. Used to render a
// live preview of a template in the "Awesome Templates" gallery.
const SAMPLE_INVOICE = {
  number: "INV-0001",
  invoiceDate: new Date(),
  dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  reference: "PO-4521",
  type: "Regular",
  placeOfSupply: "Maharashtra",
  eWaybill: true,
  eInvoice: false,
  notes: "Thank you for your business.",
  terms: "Payment due within 7 days of invoice date.",
  status: "saved",
  markedFullyPaid: false,
  payments: [],
  itemLevelDiscountPercent: 0,
  additionalCharges: [{ name: "Shipping", amount: 150, isTaxable: false }],
  extraDiscount: 100,
  roundOff: true,
  taxes: { tds: 0, tcs: 0 },
  lineItems: [
    { name: "Consulting Services", description: "Onboarding & setup", qty: 2, unitPrice: 5000, discount: 5, discountMode: "percent", taxRate: 18, hsn: "9983" },
    { name: "Premium Widget", description: "Compact model", qty: 10, unitPrice: 350, discount: 0, discountMode: "percent", taxRate: 12, hsn: "8471" },
    { name: "Support Plan (Annual)", description: "24x7 priority support", qty: 1, unitPrice: 12000, discount: 500, discountMode: "amount", taxRate: 18, hsn: "9984" },
  ],
  customerId: {
    header: { name: "Coastal Retail Traders" },
    gstin: "27AAAAA0000A1Z5",
    contact_details: { email: "billing@samplecustomer.example", phone: "+91 98765 43210" },
    address_tab: { street: "42 MG Road", city: "Pune", state_name: "Maharashtra", zip: "411001" },
  },
};

// Returns a JSON-wrapped HTML *fragment* (not a full <html> document) so the
// gallery can embed it directly via dangerouslySetInnerHTML instead of an
// <iframe> — this app's global CSP sends `frame-ancestors 'none'` and
// `X-Frame-Options: DENY` on every response (see next.config.ts), which
// blocks framing even same-origin content, so an iframe pointed at this
// route always rendered a blank box. The fragment is the exact same
// `renderInvoiceTemplateFragment()` output the PDF route wraps into a full
// document, so the gallery preview and the printed PDF are guaranteed to be
// pixel-identical in structure.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { key } = await params;

    const [settingsDoc, org] = await Promise.all([
      (DocumentSettings as any).findOne({ tenantId }).lean(),
      Organization.findOne({ subdomain: tenantId }).lean(),
    ]);

    const def = getTemplateDefinition(key);
    const orgSettings = (org as any)?.settings || {};

    const ctx = await buildTemplateContext({
      invoice: SAMPLE_INVOICE,
      settingsDoc,
      company: {
        name: (org as any)?.name || "Aupulens Traders",
        gstin: orgSettings.gstin || "29ABCDE1234F1Z8",
        logo: orgSettings.logo,
        address: [orgSettings.addressLine1, orgSettings.addressLine2, orgSettings.city, orgSettings.pincode].filter(Boolean).join(", "),
        state: orgSettings.state || "Maharashtra",
      },
      bank: { accountName: "Business Current Account", accountNumber: "0123456789", bankName: "Sample Bank", ifsc: "SMPL0000123", upiId: "sample@upi" },
      signatureUrl: null,
      documentType: "invoice",
    });

    const html = renderInvoiceTemplateFragment(def, ctx);
    return NextResponse.json({ success: true, data: { html, orientation: def.orientation } });
  } catch (error: any) {
    console.error("Template preview error:", error);
    return NextResponse.json({ success: false, message: "Error rendering preview" }, { status: 500 });
  }
}
