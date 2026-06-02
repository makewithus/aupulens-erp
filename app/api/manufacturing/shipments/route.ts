import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Shipment from '@/models/Shipment';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session || !['admin', 'manufacturing'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    
    // Parse URL search params
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber');
    const id = searchParams.get('id');

    // If tracking number is provided, search by tracking number or shipment number
    if (trackingNumber) {
      const shipments = await Shipment.find({
        tenantId,
        $or: [
          { trackingNumber: trackingNumber },
          { shipmentNumber: trackingNumber }
        ]
      }).lean();
      return NextResponse.json({ shipments });
    }

    // If ID is provided, search by specific ID
    if (id) {
      const shipment = await Shipment.findOne({ _id: id, tenantId }).lean();
      if (!shipment) {
        return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
      }
      return NextResponse.json(shipment);
    }

    // Otherwise return all shipments
    const shipments = await Shipment.find({ tenantId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ shipments });
  } catch (error) {
    console.error('Error fetching shipments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || !['admin', 'manufacturing'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    const body = await request.json();
    
    if (!body.shipmentNumber || !body.customerName || !body.origin || !body.destination || !body.freightProvider) {
      return NextResponse.json(
        { error: 'Shipment number, customer, origin, destination, and freight provider are required' },
        { status: 400 }
      );
    }

    await connectDB();
    const shipment = await Shipment.create({ ...body, tenantId });
    
    return NextResponse.json({ shipment }, { status: 201 });
  } catch (error) {
    console.error('Error creating shipment:', error);
    if ((error as any).code === 11000) {
      return NextResponse.json({ error: 'Shipment number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session || !['admin', 'manufacturing'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const body = await request.json();
    const { _id, ...updateData } = body;

    if (!_id) {
      return NextResponse.json({ error: 'Shipment ID is required' }, { status: 400 });
    }

    await connectDB();
    const shipment = await Shipment.findOneAndUpdate(
      { _id, tenantId },
      { $set: updateData },
      { new: true },
    );
    
    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    return NextResponse.json(shipment);
  } catch (error) {
    console.error('Error updating shipment:', error);
    return NextResponse.json({ error: 'Failed to update shipment' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session || !['admin', 'manufacturing'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Shipment ID is required' }, { status: 400 });
    }

    await connectDB();
    const shipment = await Shipment.findOneAndDelete({ _id: id, tenantId });
    
    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Shipment deleted successfully' });
  } catch (error) {
    console.error('Error deleting shipment:', error);
    return NextResponse.json({ error: 'Failed to delete shipment' }, { status: 500 });
  }
}
