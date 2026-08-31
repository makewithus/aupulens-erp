import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import CustomsClearance from '@/models/manufacturing/CustomsClearance';
import Shipment from '@/models/manufacturing/Shipment';

const ALLOWED_ROLES = ['admin', 'manufacturing', 'master-admin'];

// The create FORM (and the AI prefill built on top of it) collects a simpler
// field set than this — declarationNumber/status/dutyAmount — than the
// model's full schema — clearanceNumber/shipmentNumber/country/
// declarationType/totalValue/a DOCUMENT_STATUS enum. Those never lined up
// (the form's "pending"/"under-review"/"cleared" aren't even valid enum
// values), so every create from the UI 400'd. Mapped below instead of
// silently rejecting what the form actually sends.
const STATUS_MAP: Record<string, string> = {
  pending: 'draft',
  'under-review': 'pending_approval',
  cleared: 'approved',
  rejected: 'rejected',
};

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }



    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const { searchParams } = new URL(request.url);
    const query: any = { tenantId };
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) query.createdAt = range;
    }

    const clearances = await CustomsClearance.find(query).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ clearances });
  } catch (error) {
    console.error('Error fetching customs clearances:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await request.json();
    await connectDB();

    // The form only collects shipmentId (a select) — look up its number, the
    // field the model actually stores, when the caller didn't send it directly.
    let shipmentNumber = body.shipmentNumber;
    if (!shipmentNumber && body.shipmentId) {
      const ship: any = await Shipment.findOne({ _id: body.shipmentId, tenantId }, 'shipmentNumber').lean();
      shipmentNumber = ship?.shipmentNumber || '';
    }
    const clearanceNumber = body.clearanceNumber || body.declarationNumber;
    const dutyAmount = Number(body.dutyAmount) || 0;

    if (!clearanceNumber || !shipmentNumber || !body.customsOffice) {
      return NextResponse.json(
        { error: 'Declaration/clearance number, a valid shipment, and customs office are required' },
        { status: 400 }
      );
    }

    const clearance = await CustomsClearance.create({
      tenantId,
      clearanceNumber,
      shipmentId: body.shipmentId || undefined,
      shipmentNumber,
      customsOffice: body.customsOffice,
      country: body.country || 'India',
      declarationType: body.declarationType || 'import',
      totalValue: Number(body.totalValue) || dutyAmount,
      currency: body.currency || 'INR',
      totalDuty: dutyAmount,
      totalTax: Number(body.totalTax) || 0,
      status: STATUS_MAP[body.status] || body.status || 'draft',
      submittedDate: body.submissionDate || body.submittedDate,
      notes: body.notes,
    });

    return NextResponse.json({ clearance }, { status: 201 });
  } catch (error) {
    console.error('Error creating customs clearance:', error);
    if ((error as any).code === 11000) {
      return NextResponse.json({ error: 'Clearance number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
