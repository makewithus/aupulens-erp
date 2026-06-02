import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import HSCode from '@/models/HSCode';

export async function GET() {
  try {
    const session = await auth();
    if (!session || !['admin', 'manufacturing'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const hsCodes = await HSCode.find({ tenantId }).sort({ hsCode: 1 }).lean();
    return NextResponse.json({ hsCodes });
  } catch (error) {
    console.error('Error fetching HS codes:', error);
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
    
    if (!body.hsCode || !body.description || !body.category) {
      return NextResponse.json(
        { error: 'HS code, description, and category are required' },
        { status: 400 }
      );
    }

    await connectDB();
    const hsCode = await HSCode.create({ ...body, tenantId });
    
    return NextResponse.json({ hsCode }, { status: 201 });
  } catch (error) {
    console.error('Error creating HS code:', error);
    if ((error as any).code === 11000) {
      return NextResponse.json({ error: 'HS code already exists' }, { status: 409 });
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
      return NextResponse.json({ error: 'HS Code ID is required' }, { status: 400 });
    }

    await connectDB();
    const hsCode = await HSCode.findOneAndUpdate(
      { _id, tenantId },
      { $set: updateData },
      { new: true },
    );
    
    if (!hsCode) {
      return NextResponse.json({ error: 'HS Code not found' }, { status: 404 });
    }

    return NextResponse.json(hsCode);
  } catch (error) {
    console.error('Error updating HS code:', error);
    return NextResponse.json({ error: 'Failed to update HS code' }, { status: 500 });
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
      return NextResponse.json({ error: 'HS Code ID is required' }, { status: 400 });
    }

    await connectDB();
    const hsCode = await HSCode.findOneAndDelete({ _id: id, tenantId });
    
    if (!hsCode) {
      return NextResponse.json({ error: 'HS Code not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'HS Code deleted successfully' });
  } catch (error) {
    console.error('Error deleting HS code:', error);
    return NextResponse.json({ error: 'Failed to delete HS code' }, { status: 500 });
  }
}
