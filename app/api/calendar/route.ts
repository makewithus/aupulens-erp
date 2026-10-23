import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { getCalendarEvents } from "@/lib/calendar/aggregateEvents";
import CalendarEvent from "@/models/shared/CalendarEvent";

/**
 * Smart Enterprise Calendar (6.5). GET returns the unified, role-scoped event
 * list for a date range (aggregated across CRM/HR/finance/payroll + user
 * events). POST creates a user calendar event. PATCH updates/reschedules an event.
 * DELETE removes an event.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;
  const role = ((session.user as any).role || "").toLowerCase();

  const url = new URL(req.url);
  const now = new Date();
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const events = await getCalendarEvents(session.user.tenantId, role, from, to);
  return NextResponse.json({ success: true, data: events });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;

  const body = await req.json();
  if (!body.title || !body.start) return NextResponse.json({ success: false, message: "title and start are required" }, { status: 400 });

  await dbConnect();
  const event = await CalendarEvent.create({
    tenantId: session.user.tenantId,
    title: String(body.title),
    description: body.description,
    type: ["meeting", "reminder", "deadline", "other"].includes(body.type) ? body.type : "meeting",
    start: new Date(body.start),
    end: body.end ? new Date(body.end) : undefined,
    allDay: !!body.allDay,
    ownerId: body.ownerId || session.user.id,
    createdBy: session.user.id,
  });
  return NextResponse.json({ success: true, data: event });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;

  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ success: false, message: "event id is required" }, { status: 400 });
  }

  await dbConnect();
  const updates: Record<string, any> = {};
  if (body.title !== undefined) updates.title = String(body.title);
  if (body.description !== undefined) updates.description = body.description;
  if (body.type !== undefined && ["meeting", "reminder", "deadline", "other"].includes(body.type)) {
    updates.type = body.type;
  }
  if (body.start !== undefined) updates.start = new Date(body.start);
  if (body.end !== undefined) updates.end = body.end ? new Date(body.end) : null;
  if (body.allDay !== undefined) updates.allDay = !!body.allDay;

  const updatedEvent = await CalendarEvent.findOneAndUpdate(
    { _id: body.id, tenantId: session.user.tenantId },
    { $set: updates },
    { new: true }
  );

  if (!updatedEvent) {
    return NextResponse.json({ success: false, message: "Event not found or not editable" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: updatedEvent });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;

  const url = new URL(req.url);
  const idFromUrl = url.searchParams.get("id");
  let id = idFromUrl;

  if (!id) {
    try {
      const body = await req.json();
      id = body?.id;
    } catch {
      // url param was empty and body has no json
    }
  }

  if (!id) {
    return NextResponse.json({ success: false, message: "event id is required" }, { status: 400 });
  }

  await dbConnect();
  const deletedEvent = await CalendarEvent.findOneAndDelete({
    _id: id,
    tenantId: session.user.tenantId,
  });

  if (!deletedEvent) {
    return NextResponse.json({ success: false, message: "Event not found or already deleted" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Event successfully deleted" });
}
