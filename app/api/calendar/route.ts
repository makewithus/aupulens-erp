import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { getCalendarEvents } from "@/lib/calendar/aggregateEvents";
import CalendarEvent from "@/models/CalendarEvent";

/**
 * Smart Enterprise Calendar (6.5). GET returns the unified, role-scoped event
 * list for a date range (aggregated across CRM/HR/finance/payroll + user
 * events). POST creates a user calendar event.
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
