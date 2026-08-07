import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";

/** Toggle archive on a Manufacturing chat (Scope C). Mirrors Finance's route. */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantIdGuard = requireTenantId(session);
  if (tenantIdGuard) return tenantIdGuard;
  const tenantId = (session.user as any).tenantId;

  const { chatId, isArchived } = await request.json();
  if (!chatId || typeof isArchived !== "boolean") {
    return NextResponse.json({ error: "Chat ID and archive status required" }, { status: 400 });
  }

  await dbConnect();
  const chat = await ChatHistory.findOneAndUpdate(
    { _id: chatId, userId: session.user.id, tenantId, module: "sales" },
    { isArchived },
    { new: true },
  );
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  return NextResponse.json({ chat });
}
