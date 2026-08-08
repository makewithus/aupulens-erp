import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Integration from "@/models/Integration";
import { testConnection } from "@/lib/integrations/connectionService";

// POST /api/integrations/connections/[id]/test — run the reachability probe.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await Integration.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  const result = await testConnection(job);
  return NextResponse.json({ success: true, data: { ok: result.ok, message: result.message, status: job.status } });
}
