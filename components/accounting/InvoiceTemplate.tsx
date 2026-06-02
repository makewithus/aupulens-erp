import { format } from "date-fns";

export function InvoiceTemplate({
  data,
  company,
}: {
  data: any;
  company?: any;
}) {
  if (!data) return null;

  const formatDate = (d: any) => {
    if (!d) return "";
    try {
      return format(new Date(d), "dd MMM yyyy"); // 17 Jan 2026
    } catch (e) {
      return d;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: data.currencyId || "INR",
    }).format(amount || 0);
  };

  const partner = data.partnerId?.header
    ? data.partnerId
    : data.partnerId || {};
  const partnerName = partner.header?.name || "Unknown Customer";
  const partnerAddress = partner.address_tab || {};
  const contact = partner.contact_details || {};

  // Company details (Issuer)
  const companyName = company?.name || "Aupulens";
  const companyAddress = company?.address || "Pune, MH, India"; // Fallback

  return (
    <div className="bg-white p-8 max-w-4xl mx-auto text-black min-h-[29.7cm] text-sm">
      {/* Header */}
      <div className="flex justify-between items-start border-b pb-8 mb-8">
        <div>
          <div className="text-3xl font-bold text-gray-800 mb-2">
            Customer Invoice
          </div>
          <div className="text-xl text-gray-600">
            {data.name || "Draft Invoice"}
          </div>
        </div>
        <div className="text-right">
          <h2 className="font-bold text-lg mb-1">{companyName}</h2>
          <p className="text-gray-500">{companyAddress}</p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-12 mb-12">
        <div>
          <h3 className="text-gray-500 font-semibold mb-2 uppercase text-xs tracking-wider">
            Customer
          </h3>
          <div className="font-bold text-lg mb-1">{partnerName}</div>
          <div className="text-gray-600 leading-relaxed">
            {partnerAddress.street && <div>{partnerAddress.street}</div>}
            {partnerAddress.street2 && <div>{partnerAddress.street2}</div>}
            <div>
              {[partnerAddress.city, partnerAddress.zip]
                .filter(Boolean)
                .join(", ")}
            </div>
            {contact.phone && <div className="mt-2">Tel: {contact.phone}</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-gray-500 font-semibold mb-1 uppercase text-xs tracking-wider">
              Invoice Date
            </h3>
            <div className="font-medium">{formatDate(data.invoiceDate)}</div>
          </div>
          <div>
            <h3 className="text-gray-500 font-semibold mb-1 uppercase text-xs tracking-wider">
              Due Date
            </h3>
            <div className="font-medium">{formatDate(data.dueDate)}</div>
          </div>
          <div className="col-span-2">
            <h3 className="text-gray-500 font-semibold mb-1 uppercase text-xs tracking-wider">
              Source
            </h3>
            <div className="font-medium">{data.sourceDocument || "-"}</div>
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="mb-12">
        <h3 className="text-lg font-bold mb-4">Invoice Lines</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b-2 border-gray-100">
              <th className="py-3 font-semibold text-gray-600">Product</th>
              <th className="py-3 font-semibold text-gray-600">Label</th>
              <th className="py-3 font-semibold text-gray-600 text-right">
                Quantity
              </th>
              <th className="py-3 font-semibold text-gray-600 text-right">
                Unit Price
              </th>
              <th className="py-3 font-semibold text-gray-600 text-right">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.invoiceLines?.map((line: any, i: number) => (
              <tr key={i}>
                <td className="py-4 font-medium">{line.name}</td>
                <td className="py-4 text-gray-500">
                  {line.description || line.name}
                </td>
                <td className="py-4 text-right">{line.quantity}</td>
                <td className="py-4 text-right">
                  {formatCurrency(line.priceUnit)}
                </td>
                <td className="py-4 text-right font-medium">
                  {formatCurrency(line.priceSubtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-1/3 space-y-3">
          <div className="flex justify-between text-gray-600">
            <span>Untaxed Amount</span>
            <span>{formatCurrency(data.amountUntaxed)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Taxes</span>
            <span>{formatCurrency(data.amountTax)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold border-t pt-3 mt-3">
            <span>Total</span>
            <span>{formatCurrency(data.amountTotal)}</span>
          </div>
          <div className="flex justify-between text-blue-600 font-medium">
            <span>Amount Due</span>
            <span>{formatCurrency(data.amountResidual)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-16 pt-8 border-t text-center text-gray-400 text-xs">
        <p>Thank you for your business</p>
        <p>
          Should you have any enquiries concerning this invoice, please contact
          us.
        </p>
      </div>
    </div>
  );
}
