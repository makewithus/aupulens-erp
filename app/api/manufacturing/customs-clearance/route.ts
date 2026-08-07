import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import CustomsClearance from '@/models/CustomsClearance';

export async function GET() {
  try {
    const session = await auth();
    if (!session || !['admin', 'manufacturing'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
await connectDB();
    const clearances = await CustomsClearance.find({ tenantId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ clearances });
  } catch (error) {
    console.error('Error fetching customs clearances:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || !['admin', 'manufacturing'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await request.json();
    
    if (!body.clearanceNumber || !body.shipmentNumber || !body.customsOffice || !body.country) {
      return NextResponse.json(
        { error: 'Clearance number, shipment number, customs office, and country are required' },
        { status: 400 }
      );
    }

    await connectDB();
    const clearance = await CustomsClearance.create({ ...body, tenantId });
    
    return NextResponse.json({ clearance }, { status: 201 });
  } catch (error) {
    console.error('Error creating customs clearance:', error);
    if ((error as any).code === 11000) {
      return NextResponse.json({ error: 'Clearance number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
