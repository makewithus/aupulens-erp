import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { requireBillingOperator } from "@/lib/billing/authz";
import { handleRouteError } from "@/lib/api/validateId";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const forbidden = requireBillingOperator(session.user);
    if (forbidden) return forbidden;

    const tenantId = session.user.tenantId;
    const body = await req.json().catch(() => ({}));
    const { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (
      [paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature].some(
        (value) => typeof value !== "string" || value.trim().length === 0
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required verification parameters: paymentId, razorpayOrderId, razorpayPaymentId, and razorpaySignature are required.",
        },
        { status: 400 }
      );
    }

    const result = await subscriptionManager.verifyAndApplyUpgrade({
      tenantId,
      paymentId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    return NextResponse.json({
      success: true,
      message: "Upgrade verified and applied successfully.",
      data: result,
    });
  } catch (error: any) {
    if (error?.message?.includes("Invalid Razorpay payment signature")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return handleRouteError(error);
  }
}
