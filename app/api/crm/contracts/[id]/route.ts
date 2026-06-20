import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmContract from "@/models/crm/Contract";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

type RouteProps = { params: Promise<{ id: string }> };

// ─── GET /api/crm/contracts/[id] ─────────────────────────────────────────────
export async function GET(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();

  const contract = await CrmContract.findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("account_id", "company_name billing_address phone email account_health_score status")
      .populate("owner_id", "name email")
      .populate("opportunity_id", "deal_name amount stage")
      .populate("quote_id", "quote_number grand_total status")
      .populate("renewal_opportunity_id", "deal_name amount stage probability").lean();

  if (!contract)
    return NextResponse.json({ success: false, message: "Contract not found" }, { status: 404 });

  // Audit: view
  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "view",
    record_type: "Contract",
    record_id: contract._id,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true, data: contract });
}

// ─── PUT /api/crm/contracts/[id] ─────────────────────────────────────────────
export async function PUT(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const contract = await CrmContract.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!contract)
    return NextResponse.json({ success: false, message: "Contract not found" }, { status: 404 });

  const body = await req.json();

  // ── Validation ────────────────────────────────────────────────────────────
  if (contract.status === "Cancelled") {
    return NextResponse.json(
      { success: false, message: "A cancelled contract cannot be modified." },
      { status: 422 }
    );
  }

  if (body.status === "Renewed" && contract.status === "Cancelled") {
    return NextResponse.json(
      { success: false, message: "A cancelled contract cannot be renewed." },
      { status: 422 }
    );
  }

  if (body.status === "Expired" && contract.status === "Renewed") {
    return NextResponse.json(
      { success: false, message: "A renewed contract cannot be expired." },
      { status: 422 }
    );
  }

  if (
    body.renewal_date &&
    body.end_date &&
    new Date(body.renewal_date) > new Date(body.end_date)
  ) {
    return NextResponse.json(
      { success: false, message: "renewal_date cannot be after end_date." },
      { status: 422 }
    );
  }

  const oldStatus = contract.status;
  Object.assign(contract, body);
  await contract.save();

  // Audit: updated
  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "updated",
    record_type: "Contract",
    record_id: id,
    timestamp: new Date(),
  });

  // Audit: status change
  if (body.status && body.status !== oldStatus) {
    const actionMap: Record<string, string> = {
      Renewed: "status_changed",
      Expired: "status_changed",
      Cancelled: "status_changed",
      "Pending Signature": "status_changed",
      Active: "status_changed",
    };
    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: actionMap[body.status] || "status_changed",
      record_type: "Contract",
      record_id: id,
      field_name: "status",
      old_value: oldStatus,
      new_value: body.status,
      timestamp: new Date(),
    });
  }

  return NextResponse.json({ success: true, data: contract });
}

// ─── DELETE /api/crm/contracts/[id] ──────────────────────────────────────────
export async function DELETE(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const contract = await CrmContract.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!contract)
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  if (["Active", "Renewed"].includes(contract.status)) {
    return NextResponse.json(
      { success: false, message: "Active or renewed contracts cannot be deleted. Cancel it first." },
      { status: 422 }
    );
  }

  await contract.deleteOne();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "deleted",
    record_type: "Contract",
    record_id: id,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true });
}
