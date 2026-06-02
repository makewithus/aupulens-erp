import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import Lead from "@/models/Lead";
import Opportunity from "@/models/Opportunity";
import { OPPORTUNITY_STAGE } from "@/lib/crm/workflow";
import {
  hasCrmAccess,
  normalizeOptionalEmail,
  normalizeOptionalString,
} from "@/lib/crm/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session || !hasCrmAccess(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantId = session.user.tenantId || "default-tenant";
    const body = await request.json();

    await connectDB();

    const opportunity = await Opportunity.findOne({ _id: id, tenantId });
    if (!opportunity) {
      return NextResponse.json(
        { error: "Opportunity not found" },
        { status: 404 },
      );
    }

    if (opportunity.stage === OPPORTUNITY_STAGE.LOST) {
      return NextResponse.json(
        { error: "Lost opportunities must be reopened before conversion" },
        { status: 400 },
      );
    }

    let customer = null;

    if (body.customerId || opportunity.customerId) {
      customer = await Customer.findOne({
        _id: body.customerId || opportunity.customerId,
        tenantId,
      });
      if (!customer) {
        return NextResponse.json(
          { error: "Customer not found for this tenant" },
          { status: 404 },
        );
      }
    }

    const email =
      normalizeOptionalEmail(body.email) || opportunity.email || undefined;

    if (!customer && email && body.reuseExisting !== false) {
      customer = await Customer.findOne({
        tenantId,
        "contact_details.email": email,
      });
    }

    if (!customer) {
      const customerName =
        normalizeOptionalString(body.customerName) ||
        opportunity.companyName ||
        opportunity.contactName ||
        opportunity.name;

      customer = await Customer.create({
        tenantId,
        header: {
          name: customerName,
          is_company: Boolean(opportunity.companyName || body.isCompany),
        },
        contact_details: {
          email,
          phone:
            normalizeOptionalString(body.phone) ||
            opportunity.phone ||
            undefined,
        },
        address_tab: {
          type: "contact",
        },
        sales_purchase_tab: {
          user_id: opportunity.ownerId,
        },
        accounting_tab: {},
        createdBy: session.user.id,
      });
    }

    opportunity.customerId = customer._id as any;
    opportunity.stage = OPPORTUNITY_STAGE.WON;
    opportunity.probability = 100;
    opportunity.convertedAt = new Date();
    await opportunity.save();

    if (opportunity.sourceLeadId) {
      await Lead.findOneAndUpdate(
        { _id: opportunity.sourceLeadId, tenantId },
        {
          $set: {
            convertedCustomerId: customer._id,
            convertedOpportunityId: opportunity._id,
          },
        },
      );
    }

    return NextResponse.json({ opportunity, customer }, { status: 201 });
  } catch (error: any) {
    console.error("CRM opportunity convert error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
