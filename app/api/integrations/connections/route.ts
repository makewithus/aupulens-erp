import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Integration from "@/models/Integration";
import { getConnector } from "@/lib/integrations/registry";
import {
  encryptCredentials,
  toClientView,
  newWebhookToken,
} from "@/lib/integrations/connectionService";

function baseUrlOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

// GET /api/integrations/connections — this tenant's configured connections.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const jobs = await Integration.find({ tenantId: session.user.tenantId }).sort({ createdAt: -1 });
  return NextResponse.json({ success: true, data: jobs.map((j) => toClientView(j, baseUrlOf(req))) });
}

// POST /api/integrations/connections — create a connection for a connector.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ success: false }, { status: 401 });

  const body = await req.json();
  const connector = getConnector(body.connectorId);
  if (!connector) return NextResponse.json({ success: false, message: "Unknown connector." }, { status: 400 });
  const name = (body.name as string)?.trim() || connector.name;

  const credentials = encryptCredentials(connector, (body.credentials || {}) as Record<string, string>);

  await dbConnect();
  const job = await Integration.create({
    tenantId: session.user.tenantId,
    connectorId: connector.id,
    name,
    credentials,
    webhookToken: newWebhookToken(),
    createdBy: session.user.id,
  });

  return NextResponse.json({ success: true, data: toClientView(job, baseUrlOf(req)) });
}
