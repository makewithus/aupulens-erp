import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmSavedView from "@/models/crm/SavedView";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entity_type");
  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  const query: any = { tenantId };
  if (entityType) query.entity_type = entityType;
  
  // A user can see views they own, or views that are shared
  query.$or = [
    { owner_id: userId },
    { is_shared: true }
  ];

  const views = await CrmSavedView.find(query).sort({ is_default: -1, name: 1 }).lean();

  return NextResponse.json({ success: true, data: views });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (!body.name || !body.entity_type) {
    return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 422 });
  }

  // If this is set to default, unset previous default for this user/entity
  if (body.is_default) {
    await CrmSavedView.updateMany(
      { tenantId: session.user.tenantId, owner_id: session.user.id, entity_type: body.entity_type },
      { $set: { is_default: false } }
    );
  }

  const view = await CrmSavedView.create({
    ...body,
    tenantId: session.user.tenantId,
    owner_id: session.user.id,
    createdBy: session.user.id
  });

  return NextResponse.json({ success: true, data: view }, { status: 201 });
}
