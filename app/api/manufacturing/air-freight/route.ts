import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import AirFreight from '@/models/AirFreight';

export async function GET() {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'manufacturing' && session.user.role !== 'admin' && session.user.role !== 'master-admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();
    const airFreights = await AirFreight.find({ tenantId }).sort({ departureTime: -1 }).lean();
    return NextResponse.json(airFreights);
  } catch (error) {
    console.error('Error fetching air freights:', error);
    return NextResponse.json({ error: 'Failed to fetch air freights' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'manufacturing' && session.user.role !== 'admin' && session.user.role !== 'master-admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json();
    console.log('Received air freight data:', body);

    if (!body.flightNumber || !body.airline || !body.origin || !body.destination || 
        !body.departureTime || !body.arrivalTime || 
        (body.cargo === undefined || body.cargo === null || body.cargo === '')) {
      return NextResponse.json(
        { error: 'Flight number, airline, origin, destination, departure time, arrival time, and cargo are required' },
        { status: 400 }
      );
    }

    await connectDB();
    
    // Create the air freight record
    const airFreight = await AirFreight.create({ ...body, tenantId });
    console.log('Air freight created successfully:', airFreight);
    
    return NextResponse.json(airFreight, { status: 201 });
  } catch (error: any) {
    console.error('Error creating air freight:', error);
    console.error('Error details:', error.message, error.stack);
    return NextResponse.json({ 
      error: 'Failed to create air freight',
      details: error.message 
    }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'manufacturing' && session.user.role !== 'admin' && session.user.role !== 'master-admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json();
    const { _id, ...updateData } = body;

    if (!_id) {
      return NextResponse.json({ error: 'Air freight ID is required' }, { status: 400 });
    }

    await connectDB();
    const airFreight = await AirFreight.findOneAndUpdate(
      { _id, tenantId },
      { $set: updateData },
      { new: true },
    );
    
    if (!airFreight) {
      return NextResponse.json({ error: 'Air freight not found' }, { status: 404 });
    }

    return NextResponse.json(airFreight);
  } catch (error) {
    console.error('Error updating air freight:', error);
    return NextResponse.json({ error: 'Failed to update air freight' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'manufacturing' && session.user.role !== 'admin' && session.user.role !== 'master-admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Air freight ID is required' }, { status: 400 });
    }

    await connectDB();
    const airFreight = await AirFreight.findOneAndDelete({ _id: id, tenantId });

    if (!airFreight) {
      return NextResponse.json({ error: 'Air freight not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Air freight deleted successfully' });
  } catch (error) {
    console.error('Error deleting air freight:', error);
    return NextResponse.json({ error: 'Failed to delete air freight' }, { status: 500 });
  }
}
