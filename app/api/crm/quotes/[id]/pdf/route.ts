import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmQuote from "@/models/crm/Quote";
import CrmAccount from "@/models/crm/Account";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { generateQuotePdf } from "@/lib/crm/pdfGenerator";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();

  const quote = await CrmQuote.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!quote)
    return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });

  const account = await CrmAccount.findById((quote as any).account_id).lean();

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateQuotePdf(quote, account);
  } catch (err) {
    console.error("[PDF] generation error:", err);
    return NextResponse.json(
      { success: false, message: "PDF generation failed." },
      { status: 500 }
    );
  }

  // Audit: download
  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "download",
    record_type: "Quote",
    record_id: (quote as any)._id,
    new_value: "PDF downloaded",
    timestamp: new Date(),
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${(quote as any).quote_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
