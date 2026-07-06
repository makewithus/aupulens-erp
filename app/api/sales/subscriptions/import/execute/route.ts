import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import Subscription from "@/models/Subscription";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateSubscriptionNumber } from "@/lib/sales/subscriptionNumbering";
import { computeInitialSchedule } from "@/lib/sales/subscriptionBilling";
import { SUBSCRIPTION_BILLING_FREQUENCY, SUBSCRIPTION_BILLING_FREQUENCY_VALUES, SALES_SUBSCRIPTION_STATUS } from "@/lib/constants/statuses";
import * as xlsx from "xlsx";
import { validateSpreadsheetFile } from "@/lib/utils/fileValidation";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantId = session.user.tenantId;

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingStr = formData.get("mapping") as string;
    const autoGenerateNumbers = formData.get("autoGenerateNumbers") !== "false";
    const mapAddresses = formData.get("mapAddresses") === "true";

    if (!file || !mappingStr) {
      return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
    }

    const fileError = validateSpreadsheetFile(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const mapping = JSON.parse(mappingStr) as Record<string, string>;
    const bytes = await file.arrayBuffer();
    const workbook = xlsx.read(Buffer.from(bytes), { type: "buffer" });
    // raw:false forces every cell to its displayed string form. Without it,
    // xlsx returns date-like cells (Start Date) as raw Excel serial-day
    // numbers for real .xls/.xlsx files; `new Date(serialNumber)` then
    // silently misinterprets that small number as milliseconds-since-epoch,
    // producing a bogus ~1970 date instead of the real one. Numeric fields
    // (Quantity/Rate/Trial Days/Billing Cycles) still parse fine as strings
    // via Number(...) below.
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false }) as any[];

    let imported = 0;
    let skipped = 0;
    const overwritten = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const get = (key: string) => (mapping[key] ? row[mapping[key]] : undefined);

      const customerName = get("customerName");
      const planName = get("planName");
      const itemName = get("itemName") || planName;

      if (!customerName) {
        errors.push(`Row ${i + 2}: Customer Name is required`);
        continue;
      }
      if (!planName) {
        errors.push(`Row ${i + 2}: Plan Name is required`);
        continue;
      }

      const customer = await Customer.findOne({
        tenantId,
        $or: [{ "header.displayName": String(customerName).trim() }, { "header.name": String(customerName).trim() }],
      });

      if (!customer) {
        errors.push(`Row ${i + 2}: Customer "${customerName}" not found — create the customer first`);
        skipped++;
        continue;
      }

      if (mapAddresses) {
        const street = get("billingStreet");
        const city = get("billingCity");
        const state = get("billingState");
        const zip = get("billingZip");
        if (street || city || state || zip) {
          customer.addresses = customer.addresses || [];
          customer.addresses.push({
            type: "billing",
            street: street ? String(street) : undefined,
            city: city ? String(city) : undefined,
            state_name: state ? String(state) : undefined,
            zip: zip ? String(zip) : undefined,
            isPrimary: customer.addresses.length === 0,
          } as any);
          await customer.save();
        }
      }

      const qty = Number(get("quantity")) || 1;
      const rate = Number(get("rate")) || 0;
      const totals = computeInvoiceTotals({
        lineItems: [{ name: String(itemName), qty, unitPrice: rate, discount: 0, discountMode: "percent", taxRate: 0 }],
      });

      const rawFrequency = String(get("billingFrequency") || "").toLowerCase().replace(/[\s-]/g, "_");
      const billingFrequency = (SUBSCRIPTION_BILLING_FREQUENCY_VALUES as string[]).includes(rawFrequency)
        ? rawFrequency
        : SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY;

      const startDate = get("startDate") ? new Date(get("startDate")) : new Date();
      const trialDays = Math.max(0, Number(get("trialDays")) || 0);
      const cyclesRaw = get("billingCycles");
      const neverExpires = !cyclesRaw || Number(cyclesRaw) <= 0;
      const expiresAfterCycles = neverExpires ? undefined : Number(cyclesRaw);

      const schedule = computeInitialSchedule({
        startDate,
        trialDays,
        billingFrequency: billingFrequency as any,
        neverExpires,
        expiresAfterCycles,
      });

      let number = autoGenerateNumbers ? undefined : get("subscriptionNumber");
      if (!number) {
        const generated = await generateSubscriptionNumber(tenantId);
        number = generated.number;
      }

      try {
        await Subscription.create({
          tenantId,
          customerId: customer._id,
          number,
          profileName: String(planName).trim(),
          lineItems: totals.computedLines,
          totalAmount: totals.totalAmount,
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
          customerNotes: get("customerNotes"),
          status: trialDays > 0 ? SALES_SUBSCRIPTION_STATUS.TRIAL : SALES_SUBSCRIPTION_STATUS.ACTIVE,
          createdBy: session.user.id,
        });
        imported++;
      } catch (e: any) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, imported, skipped, overwritten, errors });
  } catch (error) {
    console.error("Subscription Import Execution Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
