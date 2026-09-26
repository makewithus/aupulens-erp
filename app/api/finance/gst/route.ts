import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { getGstLedger, postGstSetoff } from "@/lib/accounting/gstLedger";

function previousCompletedMonth() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "finance"].includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const period = req.nextUrl.searchParams.get("period") || previousCompletedMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  const asOf = new Date(`${period}-01T00:00:00Z`); asOf.setUTCMonth(asOf.getUTCMonth() + 1); asOf.setUTCMilliseconds(-1);
  try {
    await connectDB();
    return NextResponse.json({ success: true, data: await getGstLedger(session.user.tenantId, asOf) });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "finance"].includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await req.json();
    await connectDB();
    const entry = await postGstSetoff(session.user.tenantId, session.user.id, body.period, body.expected);
    return NextResponse.json({ success: true, journalEntryId: entry._id });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
