import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiMemory from "@/models/ai/AiMemory";
import AiMemoryPreference from "@/models/ai/AiMemoryPreference";
import type { AiMemoryScope } from "@/models/ai/AiMemory";

const VALID_SCOPES: AiMemoryScope[] = ["user", "global", "admin", "finance", "hr", "sales", "inventory", "manufacturing", "crm"];
const SENSITIVE = /(mongodb(?:\+srv)?:\/\/|(?:api[_-]?key|secret|password|token)\s*[:=]|\bsk-[A-Za-z0-9_-]{12,}|\b[A-Za-z0-9_-]{32,}\b)/i;
const userKey = (userId: string, key: string) => `${userId}:${key}`;
const ownsMemory = (memory: any, tenantId: string, userId: string) =>
  memory.tenantId === tenantId && memory.scope === "user" && String(memory.ownerUserId) === userId;

function canAccessScope(role: string, scope: AiMemoryScope) {
  if (scope === "user") return true;
  if (role === "admin" || role === "master-admin") return true;
  const roleScopes: Record<string, AiMemoryScope[]> = {
    finance: ["finance", "inventory"], sales: ["sales"], inventory: ["inventory"],
    manufacturing: ["manufacturing"], hr: ["hr"], crm: ["crm"],
  };
  return roleScopes[role]?.includes(scope) ?? false;
}

async function getIdentity() {
  const session = await auth();
  if (!session?.user?.id || !(session.user as any).tenantId) return null;
  return { session, userId: session.user.id, tenantId: (session.user as any).tenantId as string };
}

// GET /api/ai/memory — current user's saved facts and memory preference.
export async function GET(_request?: NextRequest) {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { session, tenantId, userId } = identity;
  const preference = await AiMemoryPreference.findOne({ tenantId, userId }).select("enabled updatedAt").lean();
  const filter: Record<string, unknown> = { tenantId, deletedAt: null, approved: true };
  if (session.user.role === "admin" || session.user.role === "master-admin") {
    filter.$or = [
      { scope: "user", ownerUserId: userId },
      { scope: { $in: ["global", "admin", "finance", "hr", "sales", "inventory", "manufacturing", "crm"] }, ownerUserId: { $exists: false } },
    ];
  } else {
    filter.scope = "user";
    filter.ownerUserId = userId;
  }
  const memories = await AiMemory.find(filter).sort({ updatedAt: -1 }).limit(200)
    .select("scope key value category sourceConversationId sourceMessageId ownerUserId updatedAt").lean();
  const visible = memories.map((memory: any) => ({ ...memory, key: memory.scope === "user" ? memory.key.replace(`${userId}:`, "") : memory.key }));
  return NextResponse.json({ success: true, enabled: preference?.enabled !== false, data: visible });
}

// POST supports explicit user memories and preference updates. Workspace
// memories remain administrator-managed and are tenant-scoped.
export async function POST(request: NextRequest) {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { session, tenantId, userId } = identity;

  if (typeof body.enabled === "boolean") {
    await connectDB();
    const preference = await AiMemoryPreference.findOneAndUpdate(
      { tenantId, userId }, { $set: { tenantId, userId, enabled: body.enabled } }, { upsert: true, new: true },
    ).select("enabled updatedAt").lean();
    return NextResponse.json({ success: true, enabled: preference?.enabled !== false });
  }

  const scope = body.scope as AiMemoryScope;
  if (!VALID_SCOPES.includes(scope) || !canAccessScope(session.user.role || "", scope)) {
    return NextResponse.json({ error: "Memory scope is not available to this account." }, { status: 403 });
  }
  const key = typeof body.key === "string" ? body.key.trim().slice(0, 100) : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!key || !value || value.length > 2000) return NextResponse.json({ error: "Provide a memory label and a value up to 2,000 characters." }, { status: 400 });
  if (SENSITIVE.test(`${key}\n${value}`)) return NextResponse.json({ error: "Credentials and secret tokens cannot be saved as memory." }, { status: 400 });
  if (scope !== "user" && session.user.role !== "admin" && session.user.role !== "master-admin") {
    return NextResponse.json({ error: "Only an administrator can save workspace memory." }, { status: 403 });
  }

  await connectDB();
  const dbKey = scope === "user" ? userKey(userId, key) : key;
  const filter: Record<string, unknown> = { tenantId, scope, key: dbKey };
  if (scope === "user") filter.ownerUserId = userId;
  const memory = await AiMemory.findOneAndUpdate(filter, {
    $set: { tenantId, scope, key: dbKey, value, category: body.category || "other", approved: true, deletedAt: null,
      sourceConversationId: typeof body.sourceConversationId === "string" ? body.sourceConversationId.slice(0, 100) : undefined,
      ...(scope === "user" ? { ownerUserId: userId } : {}) },
  }, { upsert: true, new: true, runValidators: true }).lean();
  return NextResponse.json({ success: true, data: { ...memory, key } });
}

// PATCH edits a memory only within its owner/workspace; DELETE removes the
// record so it cannot be resurrected by transcript retrieval.
export async function PATCH(request: NextRequest) {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!id || !value || value.length > 2000 || SENSITIVE.test(value)) return NextResponse.json({ error: "Invalid memory update." }, { status: 400 });
  await connectDB();
  const memory = await AiMemory.findById(id);
  if (!memory || (memory.scope === "user" ? !ownsMemory(memory, identity.tenantId, identity.userId) : memory.tenantId !== identity.tenantId || !["admin", "master-admin"].includes(identity.session.user.role || ""))) {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }
  memory.value = value;
  memory.approved = true;
  await memory.save();
  return NextResponse.json({ success: true, data: memory });
}

export async function DELETE(request: NextRequest) {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Memory id is required." }, { status: 400 });
  await connectDB();
  const memory = await AiMemory.findById(id);
  if (!memory || (memory.scope === "user" ? !ownsMemory(memory, identity.tenantId, identity.userId) : memory.tenantId !== identity.tenantId || !["admin", "master-admin"].includes(identity.session.user.role || ""))) {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }
  await AiMemory.deleteOne({ _id: memory._id, tenantId: identity.tenantId });
  return NextResponse.json({ success: true });
}
