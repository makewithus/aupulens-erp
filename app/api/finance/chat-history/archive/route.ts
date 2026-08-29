import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import dbConnect from '@/lib/db';
import ChatHistory from '@/models/ai/ChatHistory';

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { chatId, isArchived } = body;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    if (!chatId || typeof isArchived !== 'boolean') {
      return NextResponse.json(
        { error: 'Chat ID and archive status required' },
        { status: 400 }
      );
    }

    await dbConnect();

    const chat = await ChatHistory.findOneAndUpdate(
      { _id: chatId, userId: session.user.id, tenantId },
      { isArchived },
      { new: true }
    );

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({ chat });
  } catch (error) {
    console.error('Error updating chat archive status:', error);
    return NextResponse.json(
      { error: 'Failed to update chat' },
      { status: 500 }
    );
  }
}
