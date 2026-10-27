import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import BillingPayment, {
  BILLING_PAYMENT_STATUS,
  BILLING_PAYMENT_TYPE,
} from "@/models/billing/BillingPayment";
import SaaSSubscription from "@/models/billing/SaaSSubscription";
import Organization from "@/models/admin/Organization";
import { verifyGlobalAdmin } from "@/lib/billing/adminAuth";

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyGlobalAdmin(req);
    if (!authResult.isAuthorized) {
      return NextResponse.json(
        { success: false, error: authResult.message },
        { status: authResult.errorStatus || 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // "YYYY-MM"
    const tenantFilter = searchParams.get("tenantId");
    const statusFilter = searchParams.get("status");
    const planFilter = searchParams.get("plan");

    const query: any = { type: BILLING_PAYMENT_TYPE.UPGRADE };

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      query.createdAt = {
        $gte: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)),
        $lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
      };
    }

    if (tenantFilter) {
      query.tenantId = tenantFilter;
    }

    if (statusFilter) {
      query.status = statusFilter;
    }

    if (planFilter) {
      query["upgradeDetails.toPlan"] = planFilter;
    }

    const payments = await BillingPayment.find(query).sort({ createdAt: -1 }).lean();

    // Map each upgrade with tenant and subscription details
    const upgrades = await Promise.all(
      payments.map(async (p) => {
        const [org, sub] = await Promise.all([
          Organization.findOne({ subdomain: p.tenantId }).select("name").lean(),
          SaaSSubscription.findOne({ tenantId: p.tenantId }).select("nextRenewalDate").lean(),
        ]);

        return {
          id: p._id,
          tenantId: p.tenantId,
          tenantName: org?.name || p.tenantId,
          previousPlan: p.upgradeDetails?.fromPlan || "starter",
          newPlan: p.upgradeDetails?.toPlan || "pro",
          upgradeTimestamp: p.createdAt,
          billingFrequency: p.billingCycle || "monthly",
          upgradeStatus: p.status === BILLING_PAYMENT_STATUS.SUCCESSFUL ? "active" : p.status,
          effectiveDate: p.createdAt,
          amountCharged: p.amount,
          proration: {
            taxableAmount: p.taxBreakup?.taxableAmount || 0,
            daysRemaining: p.upgradeDetails?.daysRemaining || 0,
            totalDaysInCycle: p.upgradeDetails?.totalDaysInCycle || 30,
            prorationFraction: p.upgradeDetails?.prorationFraction || 0,
          },
          tax: {
            cgst: p.taxBreakup?.cgst || 0,
            sgst: p.taxBreakup?.sgst || 0,
            igst: p.taxBreakup?.igst || 0,
            totalTax: p.taxBreakup?.totalTax || 0,
            isInterState: Boolean(p.taxBreakup?.isInterState),
          },
          currency: p.currency,
          paymentStatus: p.status,
          paymentReference: p.razorpayPaymentId || p.razorpayOrderId || "—",
          relatedInvoice: p.invoiceId || "—",
          nextRenewalDate: sub?.nextRenewalDate || null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: upgrades,
    });
  } catch (error: any) {
    console.error("Platform upgrades error:", error);
    return NextResponse.json(
      { success: false, error: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}
