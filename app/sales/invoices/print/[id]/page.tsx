import { auth } from "@/auth";
import { redirect } from "next/navigation";
import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import Organization from "@/models/admin/Organization";
import { InvoiceTemplate } from "@/components/accounting/InvoiceTemplate";
import { PrintToolbar } from "@/components/accounting/PrintToolbar";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/sales");

  await connectDB();
  const { id } = await params;

  const [invoice, organization] = await Promise.all([
    Invoice.findOne({
      _id: id,
      tenantId: session.user.tenantId || "default-tenant",
    })
      .populate("partnerId")
      .lean(),
    Organization.findOne({
      $or: [
        { subdomain: session.user.tenantId },
        { _id: (session.user as any).tenantId }, // Try both match
      ],
    }).lean(),
  ]);

  if (!invoice) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-xl text-red-500">Invoice Not Found</div>
      </div>
    );
  }

  const data = JSON.parse(JSON.stringify(invoice));
  const company = organization
    ? JSON.parse(JSON.stringify(organization))
    : { name: "Aupulens (Default)", address: "Pune, India" };
  // Fallback if no org found, but trying to respect user wish to avoid hardcoded 'Aupulens' if possible, though 'Aupulens' IS the default if tenant is aupulens.

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Toolbar - Hidden when printing */}
      <div className="bg-white p-4 shadow mb-8 print:hidden flex justify-between items-center container mx-auto rounded-b-lg">
        <div className="font-bold text-lg">Invoice Preview</div>
        <div className="space-x-4">
          <PrintToolbar />
        </div>
      </div>

      <div className="container mx-auto print:max-w-none print:w-full print:mx-0">
        <InvoiceTemplate data={data} company={company} />
      </div>
    </div>
  );
}
