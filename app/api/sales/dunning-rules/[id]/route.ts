import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import DunningRule from "@/models/sales/DunningRule";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    await connectDB();
    const rule = await DunningRule.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
    if (!rule) {
      return NextResponse.json({ success: false, message: "Dunning rule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (error: any) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    await connectDB();

const body = stripProtectedFields(await request.json());

    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.status !== undefined) update.status = body.status;
    if (body.criteria !== undefined) update.criteria = body.criteria;
    if (body.paymentMethod !== undefined) update.paymentMethod = body.paymentMethod;
    if (body.autocharge !== undefined) update.autocharge = body.autocharge;
    if (body.manual !== undefined) update.manual = body.manual;

    const rule = await DunningRule.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: update },
      { new: true },
    );
    if (!rule) {
      return NextResponse.json({ success: false, message: "Dunning rule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rule });

  } catch (error: any) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    await connectDB();


const rule = await DunningRule.findOneAndDelete({
      _id: id,
      tenantId: session.user.tenantId,
      isDefault: false,
    });
    if (!rule) {
      return NextResponse.json(
        { success: false, message: "Rule not found or the default rule cannot be deleted" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return handleRouteError(error);
  }
}
