import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ChatHistory from "@/models/ai/ChatHistory";

// GET - Fetch all chat history for user
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    const query: any = {
      userId: session.user.id,
      tenantId,
    };
    if (!includeArchived) {
      query.isArchived = false;
    }

    const chats = await ChatHistory.find(query)
      .sort({ updatedAt: -1 })
      .select("_id conversationId title isArchived createdAt updatedAt messages")
      .lean();

    return NextResponse.json({ chats });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat history" },
      { status: 500 },
    );
  }
}

// POST - Create new chat or save current chat
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { title, messages, chatId, conversationId } = await req.json();

    await dbConnect();

    if (chatId) {
      // Update existing chat
      const chat = await ChatHistory.findOneAndUpdate(
        {
          _id: chatId,
          userId: session.user.id,
          tenantId,
        },
        {
          title,
          messages,
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!chat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }

      return NextResponse.json({ chat });
    } else if (typeof conversationId === "string" && conversationId.length <= 100) {
      // The assistant returns this stable ID before streaming. Upsert the full
      // completed thread against that ID so later turns and reloads share memory.
      // Both tenant and owner are part of the match; a client cannot overwrite
      // another user's conversation by submitting a guessed ID.
      const safeMessages = Array.isArray(messages)
        ? messages.slice(-500).filter((m: any) =>
            m && (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" && m.content.length <= 100_000,
          ).map((m: any) => ({ role: m.role, content: m.content, timestamp: m.timestamp && Number.isFinite(Date.parse(m.timestamp)) ? new Date(m.timestamp) : new Date() }))
        : [];
      const chat = await ChatHistory.findOneAndUpdate(
        { tenantId, userId: session.user.id, conversationId, module: "admin" },
        {
          $set: { messages: safeMessages, updatedAt: new Date() },
          $setOnInsert: { tenantId, userId: session.user.id, conversationId, module: "admin", isArchived: false, title: String(title || "New Chat").slice(0, 120) },
        },
        { upsert: true, new: true, runValidators: true },
      );
      return NextResponse.json({ chat });
    } else {
      return NextResponse.json({ error: "Conversation ID required" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error saving chat:", error);
    return NextResponse.json({ error: "Failed to save chat" }, { status: 500 });
  }
}

// DELETE - Delete a chat
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json({ error: "Chat ID required" }, { status: 400 });
    }

    await dbConnect();

    const result = await ChatHistory.findOneAndDelete({
      _id: chatId,
      userId: session.user.id,
      tenantId,
    });

    if (!result) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting chat:", error);
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 },
    );
  }
}
