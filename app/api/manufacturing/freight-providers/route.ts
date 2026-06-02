import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import FreightProvider from '@/models/FreightProvider';

export async function GET() {
  try {
    const session = await auth();
    if (!session || !['admin', 'manufacturing'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const providers = await FreightProvider.find({ tenantId }).sort({ providerName: 1 }).lean();
    return NextResponse.json({ providers });
  } catch (error) {
    console.error('Error fetching freight providers:', error);
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
    
    if (!body.providerName || !body.providerCode || !body.contactPerson || !body.contactEmail) {
      return NextResponse.json(
        { error: 'Provider name, code, contact person, and email are required' },
        { status: 400 }
      );
    }

    await connectDB();
    const provider = await FreightProvider.create({ ...body, tenantId });
    
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    console.error('Error creating freight provider:', error);
    if ((error as any).code === 11000) {
      return NextResponse.json({ error: 'Provider code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
