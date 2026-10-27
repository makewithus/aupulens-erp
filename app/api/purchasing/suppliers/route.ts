import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import Customer from "@/models/sales/Customer";
import { stripProtectedFields } from "@/lib/api/validateId";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {
      tenantId,
      isSupplier: true,
    };

    if (search) {
      const words = search.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      query.$and = words.map((word) => ({
        $or: [
          { "header.name": { $regex: word, $options: "i" } },
          { "header.displayName": { $regex: word, $options: "i" } },
          { "header.companyName": { $regex: word, $options: "i" } },
          { "contact_details.email": { $regex: word, $options: "i" } },
          { "contact_details.phone": { $regex: word, $options: "i" } },
          { gstin: { $regex: word, $options: "i" } },
        ],
      }));
    }

    const [total, suppliers] = await Promise.all([
      Customer.countDocuments(query),
      Customer.find(query)
        .sort({ "header.name": 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({
      items: suppliers,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const body = stripProtectedFields(await request.json());
    const name = body.header?.name || body.header?.displayName || body.name || body.displayName;
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
    }

    // Check duplicate supplier name within tenant
    const existing = await Customer.findOne({
      tenantId,
      isSupplier: true,
      $or: [
        { "header.name": new RegExp(`^${name.trim()}$`, "i") },
        { "header.displayName": new RegExp(`^${name.trim()}$`, "i") },
      ],
    }).lean();
    if (existing) {
      return NextResponse.json({ error: `Supplier with name "${name}" already exists` }, { status: 409 });
    }

    const supplier = await Customer.create({
      tenantId,
      isSupplier: true,
      isCustomer: !!body.isCustomer, // False by default, so supplier-only records never increase customer count
      header: {
        name: name.trim(),
        displayName: (body.header?.displayName || body.displayName || name).trim(),
        is_company: body.header?.is_company ?? true,
        companyName: body.header?.companyName || body.companyName || "",
      },
      contact_details: {
        email: body.contact_details?.email || body.email || "",
        phone: body.contact_details?.phone || body.phone || "",
        mobile: body.contact_details?.mobile || body.mobile || "",
        website: body.contact_details?.website || body.website || "",
      },
      address_tab: body.address_tab || body.address || {},
      accounting_tab: {
        property_account_payable_id: body.accounting_tab?.property_account_payable_id || body.property_account_payable_id,
        property_account_receivable_id: body.accounting_tab?.property_account_receivable_id,
      },
      gstin: body.gstin ? body.gstin.trim() : undefined,
      pan: body.pan ? body.pan.trim() : undefined,
      currency: body.currency || "INR",
      isActive: body.isActive !== false,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, supplier, item: supplier }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating supplier:", error);
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}
