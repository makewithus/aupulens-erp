import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import SalesQuotation from '@/models/SalesQuotation';
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export async function GET() {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'sales')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantId = (session.user as any).tenantId || "default-tenant";
await connectDB();
    const items = await SalesQuotation.find({ tenantId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching sales quotations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'sales')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const body = await request.json();

    // Validate required fields
    if (!body.quoteNumber || !body.customer || !body.items || body.items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const quotation = await SalesQuotation.create({
      quoteNumber: body.quoteNumber,
      customer: body.customer,
      customerEmail: body.customerEmail,
      items: body.items,
      subtotal: body.subtotal,
      taxRate: body.taxRate,
      taxAmount: body.taxAmount,
      amount: body.amount,
      status: body.status || DOCUMENT_STATUS.DRAFT,
      validUntil: body.validUntil,
      notes: body.notes,
    });

    return NextResponse.json({ quotation }, { status: 201 });
  } catch (error) {
    console.error('Error creating sales quotation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


