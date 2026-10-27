import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import BillingPayment, { BILLING_PAYMENT_TYPE } from "@/models/billing/BillingPayment";
import Organization from "@/models/admin/Organization";
import { verifyGlobalAdmin } from "@/lib/billing/adminAuth";

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return "";
  let str = String(field);
  // Neutralize CSV injection / formula execution in Excel/Sheets
  if (/^[=+@-]$/.test(str.charAt(0))) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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
    const exportType = searchParams.get("type") || "upgrades";
    const month = searchParams.get("month"); // "YYYY-MM"

    const query: any = {};
    if (exportType === "upgrades") {
      query.type = BILLING_PAYMENT_TYPE.UPGRADE;
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      query.createdAt = {
        $gte: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)),
        $lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
      };
    }

    const payments = await BillingPayment.find(query).sort({ createdAt: -1 }).lean();

    const orgCache = new Map<string, string>();
    const getOrgName = async (tenantId: string) => {
      if (orgCache.has(tenantId)) return orgCache.get(tenantId)!;
      const org = await Organization.findOne({ subdomain: tenantId }).select("name").lean();
      const name = org?.name || tenantId;
      orgCache.set(tenantId, name);
      return name;
    };

    let csvContent = "";

    if (exportType === "upgrades") {
      const headers = [
        "Payment ID",
        "Tenant ID",
        "Tenant Name",
        "Previous Plan",
        "New Plan",
        "Upgrade Date",
        "Billing Cycle",
        "Amount Charged",
        "Currency",
        "Taxable Amount",
        "Total Tax",
        "Payment Status",
        "Payment Reference",
        "Invoice Number",
      ];
      csvContent += headers.map(escapeCsvField).join(",") + "\n";

      for (const p of payments) {
        const tenantName = await getOrgName(p.tenantId);
        const row = [
          String(p._id),
          p.tenantId,
          tenantName,
          p.upgradeDetails?.fromPlan || "starter",
          p.upgradeDetails?.toPlan || "pro",
          new Date(p.createdAt).toISOString(),
          p.billingCycle,
          p.amount,
          p.currency,
          p.taxBreakup?.taxableAmount || 0,
          p.taxBreakup?.totalTax || 0,
          p.status,
          p.razorpayPaymentId || p.razorpayOrderId || "—",
          p.invoiceId || "—",
        ];
        csvContent += row.map(escapeCsvField).join(",") + "\n";
      }
    } else {
      const headers = [
        "Payment ID",
        "Tenant ID",
        "Type",
        "Amount",
        "Currency",
        "Status",
        "Billing Cycle",
        "Date",
        "Razorpay Order ID",
        "Razorpay Payment ID",
        "Invoice ID",
      ];
      csvContent += headers.map(escapeCsvField).join(",") + "\n";

      for (const p of payments) {
        const row = [
          String(p._id),
          p.tenantId,
          p.type,
          p.amount,
          p.currency,
          p.status,
          p.billingCycle,
          new Date(p.createdAt).toISOString(),
          p.razorpayOrderId || "",
          p.razorpayPaymentId || "",
          p.invoiceId || "",
        ];
        csvContent += row.map(escapeCsvField).join(",") + "\n";
      }
    }

    const filename = `billing_${exportType}_${month || "all"}_${Date.now()}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Export error:", error);
    return NextResponse.json(
      { success: false, error: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}
