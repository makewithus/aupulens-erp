import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Asset from "@/models/finance/Asset";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";
import { syncAssetCapitalizationEntry } from "@/lib/accounting/assetPosting";
import { withAccountingTransaction } from "@/lib/accounting/transaction";
import { isFixedAssetAccount } from "@/lib/accounting/fixedAssetAccount";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const query: any = { tenantId };
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) query.purchaseDate = range;
    }

    const items = await Asset.find(query)
      .populate("accounts.assetAccountId")
      .populate("accounts.depreciationAccountId").lean();

    return NextResponse.json({ items }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = stripProtectedFields(await req.json());

    await dbConnect();

    if (!(await isFixedAssetAccount(tenantId, body.accounts?.assetAccountId))) {
      return NextResponse.json(
        { error: "Choose an account classified as a fixed asset." },
        { status: 400 },
      );
    }

    return await withAccountingTransaction(async () => {
      const asset = new Asset({
        ...body,
        tenantId,
      });

      await asset.save();
      await syncAssetCapitalizationEntry({
        tenantId,
        asset,
        userId: (session.user as any).id,
      });
      await safeEmitEvent(tenantId, "asset.created", { assetId: String(asset._id), actingUserId: (session.user as any).id });
      return NextResponse.json(asset);
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}
