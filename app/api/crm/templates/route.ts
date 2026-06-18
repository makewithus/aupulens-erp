import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmMessageTemplate from "@/models/crm/MessageTemplate";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel");

  const query: any = { tenantId: session.user.tenantId };
  if (channel) query.channel = channel;

  const templates = await CrmMessageTemplate.find(query).lean();
  return NextResponse.json({ success: true, data: templates });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  const template = await CrmMessageTemplate.create({
    ...body,
    tenantId: session.user.tenantId,
    createdBy: session.user.id
  });

  return NextResponse.json({ success: true, data: template }, { status: 201 });
}
