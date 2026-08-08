import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Integration from "@/models/Integration";
import IntegrationEvent from "@/models/IntegrationEvent";
import { getConnector } from "@/lib/integrations/registry";
import { encryptCredentials, toClientView } from "@/lib/integrations/connectionService";

function baseUrlOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const job = await Integration.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });
  return NextResponse.json({ success: true, data: toClientView(job, baseUrlOf(req)) });
}

// PATCH — rename and/or update credentials. Only fields actually supplied are
// changed, so re-saving without re-entering a secret keeps the stored one.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await Integration.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  const connector = getConnector(job.connectorId);
  if (!connector) return NextResponse.json({ success: false, message: "Unknown connector." }, { status: 400 });

  const body = await req.json();
  if (typeof body.name === "string" && body.name.trim()) job.name = body.name.trim();

  if (body.credentials && typeof body.credentials === "object") {
    const incoming = encryptCredentials(connector, body.credentials as Record<string, string>);
    job.credentials = { ...(job.credentials as Record<string, string>), ...incoming };
    job.markModified("credentials");
  }

  await job.save();
  return NextResponse.json({ success: true, data: toClientView(job, baseUrlOf(req)) });
}

// DELETE — remove the connection and its event history.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const job = await Integration.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });
  await IntegrationEvent.deleteMany({ tenantId: session.user.tenantId, integrationId: job._id });
  await job.deleteOne();
  return NextResponse.json({ success: true });
}
