import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Integration from "@/models/Integration";

// POST /api/integrations/connections/[id]/toggle — enable/disable the connection.
// A disabled connection rejects inbound webhooks and is skipped by outbound sync.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await Integration.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  job.enabled = !job.enabled;
  await job.save();
  return NextResponse.json({ success: true, data: { enabled: job.enabled } });
}
