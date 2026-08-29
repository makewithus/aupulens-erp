import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BankFeedProvider from "@/models/finance/BankFeedProvider";
import { seedBankFeedProviders } from "@/lib/accounting/bankFeedProviderSeeder";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  await seedBankFeedProviders();

  const providers = await BankFeedProvider.find({ isActive: true }).sort({ type: 1, sortOrder: 1 }).lean();
  return NextResponse.json({
    success: true,
    data: {
      partnerBanks: providers.filter((p) => p.type === "partner_direct"),
      aggregatorBanks: providers.filter((p) => p.type === "aggregator"),
      // True once real provider credentials are configured server-side.
      isLiveConfigured: !!process.env.BANK_FEED_AGGREGATOR_CLIENT_ID,
    },
  });
}
