import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import TransactionLock from "@/models/TransactionLock";
import { TRANSACTION_LOCK_MODULE_VALUES, TRANSACTION_LOCK_MODULE } from "@/lib/constants/statuses";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const locks = await TransactionLock.find({ tenantId: session.user.tenantId }).lean();
  return NextResponse.json({ success: true, data: locks });
}

/**
 * Lock or unlock a module. Body: { module, isLocked, lockedUpToDate?, reason? }
 * Locking "all" also clears the per-module locks so status reads consistently
 * from the single "all" record (per the "Switch to Lock All Transactions" UX).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();
    const { module, isLocked, lockedUpToDate, reason } = body;

    if (!module || !TRANSACTION_LOCK_MODULE_VALUES.includes(module)) {
      return NextResponse.json({ success: false, message: "Valid module is required" }, { status: 400 });
    }
    if (isLocked && !lockedUpToDate) {
      return NextResponse.json({ success: false, message: "lockedUpToDate is required to lock" }, { status: 400 });
    }

    const doc = await TransactionLock.findOneAndUpdate(
      { tenantId: session.user.tenantId, module },
      {
        $set: {
          isLocked: !!isLocked,
          lockedUpToDate: isLocked ? new Date(lockedUpToDate) : null,
          reason: reason || "",
          lockedBy: session.user.id,
        },
      },
      { new: true, upsert: true, runValidators: true },
    );

    if (module === TRANSACTION_LOCK_MODULE.ALL && isLocked) {
      const perModule = TRANSACTION_LOCK_MODULE_VALUES.filter((m) => m !== TRANSACTION_LOCK_MODULE.ALL);
      await TransactionLock.updateMany(
        { tenantId: session.user.tenantId, module: { $in: perModule } },
        { $set: { isLocked: false, lockedUpToDate: null } },
      );
    }

    return NextResponse.json({ success: true, data: doc });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
