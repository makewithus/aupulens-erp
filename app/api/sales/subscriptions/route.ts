import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Subscription from "@/models/Subscription";
import SalesView from "@/models/SalesView";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateSubscriptionNumber } from "@/lib/sales/subscriptionNumbering";
import { computeInitialSchedule } from "@/lib/sales/subscriptionBilling";
import { buildMongoFilterFromCriteria } from "@/lib/sales/subscriptionViews";
import { resolveSpecialFilter } from "@/lib/sales/subscriptionViews.server";
import {
  SALES_SUBSCRIPTION_STATUS,
  SUBSCRIPTION_BILLING_FREQUENCY,
  SUBSCRIPTION_BILLING_FREQUENCY_VALUES,
} from "@/lib/constants/statuses";
import "@/models/Customer";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const skip = (page - 1) * limit;
    const sortField = searchParams.get("sortField") || "createdAt";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;
    const viewId = searchParams.get("viewId");
    const search = searchParams.get("search")?.trim();

    let query: Record<string, any> = { tenantId };

    if (viewId) {
      const view = await SalesView.findOne({ _id: viewId, tenantId, entityType: "subscriptions" }).lean();
      if (view) {
        query = (view as any).specialFilter
          ? { ...query, ...(await resolveSpecialFilter((view as any).specialFilter, tenantId)) }
          : { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
      }
    }

    if (search) {
      query.$or = [
        { profileName: { $regex: search, $options: "i" } },
        { number: { $regex: search, $options: "i" } },
      ];
    }

    const [total, subscriptions] = await Promise.all([
      Subscription.countDocuments(query),
      (Subscription as any)
        .find(query)
        .populate("customerId", "header contact_details")
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: subscriptions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Subscriptions GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();

    if (!body.customerId) {
      return NextResponse.json({ success: false, message: "Customer is required" }, { status: 400 });
    }
    if (!body.profileName?.trim()) {
      return NextResponse.json({ success: false, message: "Profile Name is required" }, { status: 400 });
    }
    if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
      return NextResponse.json({ success: false, message: "At least one line item is required" }, { status: 400 });
    }

    const taxMode = body.taxMode || "none";
    const taxRate = taxMode !== "none" ? Number(body.taxRate) || 0 : 0;

    const totals = computeInvoiceTotals({
      lineItems: body.lineItems,
      extraDiscount: Number(body.extraDiscount) || 0,
      extraDiscountMode: body.extraDiscountMode || "amount",
      tdsRate: taxMode === "tds" ? taxRate : 0,
      tcsRate: taxMode === "tcs" ? taxRate : 0,
    });

    const adjustment = Number(body.adjustment) || 0;
    const totalAmount = totals.totalAmount + adjustment;

    let number = body.number;
    if (!number) {
      const generated = await generateSubscriptionNumber(tenantId, body.prefix);
      number = generated.number;
    }

    const billingFrequency = SUBSCRIPTION_BILLING_FREQUENCY_VALUES.includes(body.billingFrequency)
      ? body.billingFrequency
      : SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY;
    const startDate = body.startDate ? new Date(body.startDate) : new Date();
    const trialDays = Math.max(0, Number(body.trialDays) || 0);
    const neverExpires = body.neverExpires !== false;
    const expiresAfterCycles = neverExpires ? undefined : Number(body.expiresAfterCycles) || undefined;

    const schedule = computeInitialSchedule({ startDate, trialDays, billingFrequency, neverExpires, expiresAfterCycles });

    const subscription = await Subscription.create({
      tenantId,
      customerId: body.customerId,
      number,
      profileName: body.profileName.trim(),
      lineItems: totals.computedLines,
      totalAmount,
      subTotal: totals.subtotal,
      taxAmount: totals.totalTax,
      billingFrequency,
      billEvery: 1,
      billEveryUnit: "months",
      startDate,
      trialDays,
      trialEndsAt: schedule.trialEndsAt,
      activatedOn: schedule.activatedOn,
      nextBillingOn: schedule.nextBillingOn,
      expiresOn: schedule.expiresOn,
      neverExpires,
      expiresAfterCycles,
      salesperson: body.salesperson,
      referenceNumber: body.referenceNumber,
      extraDiscount: body.extraDiscount || 0,
      extraDiscountMode: body.extraDiscountMode || "amount",
      taxMode,
      taxId: body.taxId || undefined,
      taxRate,
      adjustment,
      customerNotes: body.customerNotes,
      terms: body.terms,
      attachments: body.attachments || [],
      paymentMode: body.paymentMode || "offline",
      status:
        body.activate === false
          ? SALES_SUBSCRIPTION_STATUS.DRAFT
          : trialDays > 0
            ? SALES_SUBSCRIPTION_STATUS.TRIAL
            : SALES_SUBSCRIPTION_STATUS.ACTIVE,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: subscription }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "That subscription number is already in use. Please choose another." },
        { status: 409 },
      );
    }
    console.error("Subscriptions POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
