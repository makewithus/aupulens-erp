import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";

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
      .select("_id title isArchived createdAt updatedAt messages")
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
    const { title, messages, chatId } = await req.json();

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
    } else {
      // Create new chat
      const chat = await ChatHistory.create({
        userId: session.user.id,
        title: title || "New Chat",
        messages: messages || [],
        tenantId,
      });

      return NextResponse.json({ chat });
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
