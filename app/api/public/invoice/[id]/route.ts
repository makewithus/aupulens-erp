import { NextRequest, NextResponse } from "next/server";
import { SalesInvoice } from "@/models/SalesInvoice";
import connectDB from "@/lib/db";
import { renderInvoiceHtmlById } from "@/lib/invoiceTemplates/renderInvoiceHtml";
import { verifyPublicToken } from "@/lib/publicLinks";

/**
 * Public, session-less invoice view (Phase 5). Reachable by anyone holding a
 * valid signed link (see lib/publicLinks.ts) — this is what a WhatsApp-shared
 * invoice link points at, so an external recipient without an ERP login can
 * actually open it (previously the shared link pointed at a session-gated
 * route and 401'd for them). Authorization is the HMAC token, not a session;
 * the tenant is derived from the invoice doc itself since a valid token
 * already proves the caller is authorized for exactly this invoice.
 *
 * This route is allowlisted in middleware.ts (isPublicApi) so it isn't
 * blanket-401'd for unauthenticated requests.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || "";
    const exp = Number(searchParams.get("exp"));

    if (!verifyPublicToken("invoice", id, token, exp)) {
      return new NextResponse("This link is invalid or has expired.", { status: 403 });
    }

    await connectDB();
    // Look up by _id alone (no tenant scope) — the signed token is the
    // authorization; read the tenantId off the invoice to render it correctly.
    const invoice = await (SalesInvoice as any).findById(id).select("tenantId").lean();
    if (!invoice) return new NextResponse("Invoice not found", { status: 404 });

    const result = await renderInvoiceHtmlById({ invoiceId: id, tenantId: invoice.tenantId });
    // `"html" in result` narrows correctly under this project's strictNullChecks:false.
    if (!("html" in result)) return new NextResponse(result.message, { status: result.status });

    return new NextResponse(result.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error: any) {
    console.error("Public invoice render error:", error);
    return new NextResponse("Error rendering invoice", { status: 500 });
  }
}
