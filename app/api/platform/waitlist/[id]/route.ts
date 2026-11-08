import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Waitlist from "@/models/platform/Waitlist";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { WAITLIST_STATUS_VALUES, WaitlistStatus } from "@/lib/constants/statuses";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json(
      { success: false, message: "Not authenticated as Global Admin." },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
    await connectDB();
    const item = await Waitlist.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }, { waitlistId: id }].filter(
        Boolean
      ),
    }).lean();

    if (!item) {
      return NextResponse.json(
        { success: false, message: "Waitlist record not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: "Failed to retrieve waitlist record." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json(
      { success: false, message: "Not authenticated as Global Admin." },
      { status: 401 }
    );
  }

  const { id } = await params;

  let body: { status?: WaitlistStatus; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (body.status && !WAITLIST_STATUS_VALUES.includes(body.status)) {
    return NextResponse.json(
      {
        success: false,
        message: `Invalid status. Must be one of: ${WAITLIST_STATUS_VALUES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const updateFields: Record<string, any> = {};
    if (body.status) updateFields.status = body.status;
    if (body.notes !== undefined) updateFields.notes = String(body.notes).slice(0, 2000);

    const updated = await Waitlist.findOneAndUpdate(
      {
        $or: [
          { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined },
          { waitlistId: id },
        ].filter(Boolean),
      },
      { $set: updateFields },
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json(
        { success: false, message: "Waitlist record not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Waitlist record updated.",
      data: updated,
    });
  } catch (error: any) {
    console.error("[platform:waitlist] Update error:", error?.message || error);
    return NextResponse.json(
      { success: false, message: "Failed to update waitlist record." },
      { status: 500 }
    );
  }
}

