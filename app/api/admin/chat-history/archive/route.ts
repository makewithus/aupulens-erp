import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import dbConnect from '@/lib/db';
import ChatHistory from '@/models/ChatHistory';

// PATCH - Toggle archive status
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const { chatId, isArchived } = await req.json();

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID required' }, { status: 400 });
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
    console.error('Error archiving chat:', error);
    return NextResponse.json(
      { error: 'Failed to archive chat' },
      { status: 500 }
    );
  }
}
