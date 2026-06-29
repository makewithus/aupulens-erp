import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiMemory from "@/models/AiMemory";
import type { AiMemoryScope } from "@/models/AiMemory";

const VALID_SCOPES: AiMemoryScope[] = [
  "global", "admin", "finance", "hr", "sales", "inventory", "manufacturing",
];

// GET /api/ai/memory?scope=global          → all memories for that scope
// GET /api/ai/memory?scope=finance&key=foo → single memory
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const tenantId = (session.user as any).tenantId as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") as AiMemoryScope | null;
  const key = searchParams.get("key");

  if (!scope || !VALID_SCOPES.includes(scope)) {
    return NextResponse.json(
      { success: false, message: `scope must be one of: ${VALID_SCOPES.join(", ")}` },
      { status: 400 }
    );
  }

  await connectDB();

  if (key) {
    const memory = await AiMemory.findOne({ tenantId, scope, key }).lean();
    return NextResponse.json({ success: true, data: memory ?? null });
  }

  const memories = await AiMemory.find({ tenantId, scope }).lean();
  return NextResponse.json({ success: true, data: memories });
}

// POST /api/ai/memory  { scope, key, value }  → upsert (create or update)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const tenantId = (session.user as any).tenantId as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { scope, key, value } = body as {
    scope?: AiMemoryScope;
    key?: string;
    value?: string;
  };

  if (!scope || !VALID_SCOPES.includes(scope)) {
    return NextResponse.json(
      { success: false, message: `scope must be one of: ${VALID_SCOPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!key || typeof key !== "string" || key.trim() === "") {
    return NextResponse.json({ success: false, message: "key is required" }, { status: 400 });
  }
  if (value === undefined || value === null || typeof value !== "string") {
    return NextResponse.json({ success: false, message: "value is required" }, { status: 400 });
  }

  await connectDB();

  const memory = await AiMemory.findOneAndUpdate(
    { tenantId, scope, key: key.trim() },
    { $set: { tenantId, scope, key: key.trim(), value } },
    { upsert: true, new: true }
  ).lean();

  return NextResponse.json({ success: true, data: memory });
}
