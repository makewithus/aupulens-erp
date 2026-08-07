import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    const query: any = {
      userId: session.user.id,
      tenantId,
    };
    if (!includeArchived) {
      query.isArchived = false;
    }

    const chats = await ChatHistory.find(query).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ chats });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat history" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await request.json();
    const { chatId, title, messages } = body;

    await dbConnect();

    let chat;
    if (chatId) {
      // Update existing chat
      chat = await ChatHistory.findOneAndUpdate(
        { _id: chatId, userId: session.user.id, tenantId },
        { messages },
        { new: true },
      );

      if (!chat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
    } else {
      // Create new chat
      chat = await ChatHistory.create({
        userId: session.user.id,
        title: title || "New Chat",
        messages,
        isArchived: false,
        tenantId,
      });
    }

    return NextResponse.json({ chat });
  } catch (error) {
    console.error("Error saving chat:", error);
    return NextResponse.json({ error: "Failed to save chat" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json({ error: "Chat ID required" }, { status: 400 });
    }

    await dbConnect();

    const chat = await ChatHistory.findOneAndDelete({
      _id: chatId,
      userId: session.user.id,
      tenantId,
    });

    if (!chat) {
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
