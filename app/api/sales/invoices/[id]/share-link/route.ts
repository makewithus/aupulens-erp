import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { signPublicToken } from "@/lib/publicLinks";
import { buildTenantUrl } from "@/lib/config";

/**
 * Generates a signed, time-limited public link for an invoice (Phase 5) —
 * called by the WhatsApp-share button so the link it shares is one an
 * external recipient can actually open (see app/api/public/invoice/[id]).
 * Authenticated + tenant-scoped: only someone who can see the invoice can
 * mint a shareable link to it.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;
  await connectDB();
  const invoice = await (SalesInvoice as any).findOne({ _id: id, tenantId }).select("_id").lean();
  if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });

  const { token, exp } = signPublicToken("invoice", id);
  const base = buildTenantUrl(tenantId);
  const url = `${base}/api/public/invoice/${id}?token=${token}&exp=${exp}`;

  return NextResponse.json({ success: true, data: { url, exp } });
}
