import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";

/**
 * Manufacturing AI-assistant chat persistence (Scope C).
 *
 * The Manufacturing assistant page already had the full chat-history sidebar UI
 * (recent/archived lists, load, archive, delete) but the API routes it calls
 * did not exist — so every save 404'd and nothing persisted. This adds them,
 * mirroring the Finance chat-history routes, and correctly stamps the required
 * `module: "inventory"` + a unique `conversationId` (both required by the
 * ChatHistory schema — the older Finance route predates those fields).
 *
 * Every query is scoped by BOTH userId AND tenantId so one workspace's chats can
 * never surface in another's (see tests/ai/chatHistoryIsolation.test.ts).
 */
const MODULE = "inventory" as const;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantIdGuard = requireTenantId(session);
  if (tenantIdGuard) return tenantIdGuard;
  const tenantId = (session.user as any).tenantId;

  await dbConnect();
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const query: any = { userId: session.user.id, tenantId, module: MODULE };
  if (!includeArchived) query.isArchived = false;

  const chats = await ChatHistory.find(query).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ chats });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantIdGuard = requireTenantId(session);
  if (tenantIdGuard) return tenantIdGuard;
  const tenantId = (session.user as any).tenantId;

  const { chatId, title, messages } = await request.json();
  await dbConnect();

  let chat;
  if (chatId) {
    chat = await ChatHistory.findOneAndUpdate(
      { _id: chatId, userId: session.user.id, tenantId, module: MODULE },
      { messages },
      { new: true },
    );
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  } else {
    chat = await ChatHistory.create({
      userId: session.user.id,
      tenantId,
      module: MODULE,
      conversationId: randomUUID(),
      title: title || "New Chat",
      messages: messages || [],
      isArchived: false,
    });
  }

  return NextResponse.json({ chat });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantIdGuard = requireTenantId(session);
  if (tenantIdGuard) return tenantIdGuard;
  const tenantId = (session.user as any).tenantId;

  const chatId = new URL(request.url).searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ error: "Chat ID required" }, { status: 400 });

  await dbConnect();
  const chat = await ChatHistory.findOneAndDelete({ _id: chatId, userId: session.user.id, tenantId, module: MODULE });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
