import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import DeliveryChallan from '@/models/sales/DeliveryChallan';

export async function GET() {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'sales')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
await connectDB();
    const items = await DeliveryChallan.find({ tenantId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching delivery challans:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'sales')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await request.json();
    
    if (!body.dcNumber || !body.customer || !body.deliveryAddress || !body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: 'DC number, customer, delivery address, and at least one item are required' },
        { status: 400 }
      );
    }

    await connectDB();
    const challan = await DeliveryChallan.create(body);
    
    return NextResponse.json({ challan }, { status: 201 });
  } catch (error) {
    console.error('Error creating delivery challan:', error);
    if ((error as any).code === 11000) {
      return NextResponse.json({ error: 'DC number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}



