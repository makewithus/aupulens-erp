import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ChatHistory from "@/models/ai/ChatHistory";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    const query: any = {
      userId: session.user.id,
      tenantId,
      module: "crm",
    };
    if (!includeArchived) {
      query.isArchived = false;
    }

    const chats = await ChatHistory.find(query).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ chats });
  } catch (error) {
    console.error("Error fetching CRM chat history:", error);
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

    await connectDB();

    let chat;
    if (chatId) {
      chat = await ChatHistory.findOneAndUpdate(
        { _id: chatId, userId: session.user.id, tenantId },
        { messages },
        { new: true },
      );

      if (!chat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
    } else {
      chat = await ChatHistory.create({
        userId: session.user.id,
        title: title || "New Chat",
        messages,
        isArchived: false,
        tenantId,
        module: "crm",
        conversationId: randomUUID(),
      });
    }

    return NextResponse.json({ chat });
  } catch (error) {
    console.error("Error saving CRM chat:", error);
    return NextResponse.json(
      { error: "Failed to save chat" },
      { status: 500 },
    );
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
      return NextResponse.json(
        { error: "Chat ID required" },
        { status: 400 },
      );
    }

    await connectDB();

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
    console.error("Error deleting CRM chat:", error);
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 },
    );
  }
}
