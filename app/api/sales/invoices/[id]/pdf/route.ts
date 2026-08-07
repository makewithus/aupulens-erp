import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { renderInvoiceHtmlById } from "@/lib/invoiceTemplates/renderInvoiceHtml";

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

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const embed = searchParams.get("embed") === "1";

    const result = await renderInvoiceHtmlById({
      invoiceId: id,
      tenantId: session.user.tenantId,
      templateKeyOverride: searchParams.get("templateId"),
      fallbackCompanyName: session.user.name || undefined,
      embed,
    });

    if (!("html" in result)) {
      return new NextResponse(result.message, { status: result.status });
    }

    // `?embed=1` returns a JSON-wrapped HTML fragment for the invoice detail
    // page's in-page preview (CSP `frame-ancestors 'none'` blocks iframes even
    // same-origin). Direct download/new-tab/print use the full document.
    if (embed) {
      return NextResponse.json({ success: true, data: { html: result.html, orientation: result.orientation } });
    }

    return new NextResponse(result.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error: any) {
    console.error("PDF generation error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}
