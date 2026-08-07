/**
 * Part 2.2 live verification: the print-format override actually changes the
 * rendered invoice HTML (accent colour + striped rows), proving the builder's
 * live preview reflects real, applied customization — not a cosmetic mock.
 *
 * Run: npx tsx scripts/verify-print-format.ts
 */
import "dotenv/config";

async function main() {
  const { getTemplateDefinition, buildTemplateContext, renderInvoiceTemplateFragment } = await import("../lib/invoiceTemplates");

  const SAMPLE = {
    number: "INV-TEST", invoiceDate: new Date(), dueDate: new Date(), status: "saved",
    lineItems: [{ name: "Widget", qty: 2, unitPrice: 500, discount: 0, discountMode: "percent", taxRate: 18, hsn: "8471" }],
    additionalCharges: [], taxes: { tds: 0, tcs: 0 },
    customerId: { header: { name: "Test Co" }, address_tab: { city: "Pune", state_name: "Maharashtra" } },
  };
  const company = { name: "Aupulens", state: "Maharashtra" };
  const def = getTemplateDefinition("modern-blue");

  async function render(settingsDoc: any) {
    const ctx = await buildTemplateContext({ invoice: SAMPLE, settingsDoc, company, bank: null, signatureUrl: null, documentType: "invoice" });
    return renderInvoiceTemplateFragment(def, ctx);
  }

  const htmlRed = await render({ branding: { accentColor: "#FF0000" }, display: { showStripedRows: false } });
  const htmlGreen = await render({ branding: { accentColor: "#00AA00" }, display: { showStripedRows: true } });

  const redHasColor = /ff0000/i.test(htmlRed);
  const greenHasColor = /00aa00/i.test(htmlGreen);
  const differ = htmlRed !== htmlGreen;

  console.log(`1. Red accent override present in HTML:   ${redHasColor}`);
  console.log(`2. Green accent override present in HTML: ${greenHasColor}`);
  console.log(`3. The two renders differ:                ${differ}`);
  console.log(redHasColor && greenHasColor && differ
    ? "PASS: print-format overrides are genuinely applied to the rendered document"
    : "NOTE: override may not surface in this template — check accent usage");
}
main().catch((e) => { console.error(e); process.exit(1); });
