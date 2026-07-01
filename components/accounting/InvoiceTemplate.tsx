import { format } from "date-fns";

function numberToWords(num: number): string {
  const a = [
    "",
    "One ",
    "Two ",
    "Three ",
    "Four ",
    "Five ",
    "Six ",
    "Seven ",
    "Eight ",
    "Nine ",
    "Ten ",
    "Eleven ",
    "Twelve ",
    "Thirteen ",
    "Fourteen ",
    "Fifteen ",
    "Sixteen ",
    "Seventeen ",
    "Eighteen ",
    "Nineteen ",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  if ((num = Math.floor(num || 0)) === 0) return "Zero";
  const n = ("000000000" + num).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return "";
  let str = "";
  str +=
    Number(n[1]) != 0
      ? (a[Number(n[1])] || b[Number(n[1][0])] + " " + a[Number(n[1][1])]) + "Crore "
      : "";
  str +=
    Number(n[2]) != 0
      ? (a[Number(n[2])] || b[Number(n[2][0])] + " " + a[Number(n[2][1])]) + "Lakh "
      : "";
  str +=
    Number(n[3]) != 0
      ? (a[Number(n[3])] || b[Number(n[3][0])] + " " + a[Number(n[3][1])]) + "Thousand "
      : "";
  str +=
    Number(n[4]) != 0
      ? (a[Number(n[4])] || b[Number(n[4][0])] + " " + a[Number(n[4][1])]) + "Hundred "
      : "";
  str +=
    Number(n[5]) != 0
      ? (str != "" ? "And " : "") +
        (a[Number(n[5])] || b[Number(n[5][0])] + " " + a[Number(n[5][1])])
      : "";
  return str.trim();
}

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
      return format(new Date(d), "dd MMM yyyy");
    } catch (e) {
      return d;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: data.currencyId || "INR",
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  const partner = data.partnerId?.header ? data.partnerId : data.partnerId || {};
  const partnerName = partner.header?.name || "Unknown Customer";
  const partnerAddress = partner.address_tab || {};
  const contact = partner.contact_details || {};

  const companyName = company?.name || "Aupulens";
  const companyAddress = company?.address || "Pune, MH, India";

  return (
    <div className="bg-white p-6 max-w-[210mm] mx-auto text-black min-h-[297mm] text-[11px] font-sans border border-gray-200 shadow-sm print:shadow-none print:border-none print:p-0">
      <div className="border-2 border-gray-800">
        {/* Header Section */}
        <div className="flex justify-between items-start border-b-2 border-gray-800 p-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#0047AB] flex items-center justify-center text-white font-black text-3xl shrink-0 tracking-tighter">
              {companyName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#0047AB] uppercase">
                {companyName}
              </h1>
              <p className="text-gray-700 leading-tight mt-1">{companyAddress}</p>
              <p className="text-gray-700 font-bold mt-0.5">
                GSTIN: {company?.gstin || "27AABCU9603R1ZM"}
              </p>
              <p className="text-gray-700 text-[10px]">
                Mobile: {company?.phone || "+91 9999999999"} | Email:{" "}
                {company?.email || "billing@aupulens.com"}
              </p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="text-xl font-black text-[#0047AB] uppercase tracking-widest mb-1">
              Tax Invoice
            </div>
            <div className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">
              Original For Recipient
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="flex border-b-2 border-gray-800">
          <div className="w-[55%] p-4 border-r-2 border-gray-800">
            <h3 className="font-bold mb-1 text-gray-600 uppercase text-[10px]">
              Customer Details:
            </h3>
            <div className="font-extrabold text-sm text-gray-900 mb-1">
              {partnerName}
            </div>
            <div className="font-semibold text-gray-800">
              GSTIN: {partner?.gstin || "Unregistered"}
            </div>
            <div className="text-gray-800">Ph: {contact?.phone || "-"}</div>
            <div className="mt-2 font-bold text-gray-600 text-[10px] uppercase">
              Billing Address:
            </div>
            <div className="text-gray-800 leading-tight">
              {partnerAddress.street && <div>{partnerAddress.street}</div>}
              {partnerAddress.street2 && <div>{partnerAddress.street2}</div>}
              <div>
                {[partnerAddress.city, partnerAddress.state, partnerAddress.zip]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
          </div>
          <div className="w-[45%] p-4 grid grid-cols-[100px_1fr] gap-y-2 content-start text-gray-900">
            <div className="font-bold">Invoice #:</div>
            <div className="font-medium text-right">{data.name || "Draft"}</div>
            <div className="font-bold">Invoice Date:</div>
            <div className="font-medium text-right">{formatDate(data.invoiceDate)}</div>
            <div className="font-bold">Due Date:</div>
            <div className="font-medium text-right">{formatDate(data.dueDate)}</div>
            <div className="font-bold">Place of Supply:</div>
            <div className="font-medium text-right">
              {partnerAddress.state || "27-MAHARASHTRA"}
            </div>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-left border-collapse border-b-2 border-gray-800">
          <thead className="bg-gray-100 border-b-2 border-gray-800">
            <tr className="font-bold text-[10px] uppercase text-gray-700">
              <th className="border-r border-gray-400 p-2 text-center w-8">#</th>
              <th className="border-r border-gray-400 p-2">Item</th>
              <th className="border-r border-gray-400 p-2 text-center w-20">HSN/SAC</th>
              <th className="border-r border-gray-400 p-2 text-right w-24">Rate/Item</th>
              <th className="border-r border-gray-400 p-2 text-right w-16">Qty</th>
              <th className="p-2 text-right w-28">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {data.invoiceLines?.map((line: any, i: number) => (
              <tr key={i} className="align-top">
                <td className="border-r border-gray-400 p-2 text-center text-gray-600">
                  {i + 1}
                </td>
                <td className="border-r border-gray-400 p-2">
                  <div className="font-bold text-gray-900">{line.name}</div>
                  {line.description && (
                    <div className="text-gray-500 text-[9px] mt-0.5 leading-tight">
                      {line.description}
                    </div>
                  )}
                </td>
                <td className="border-r border-gray-400 p-2 text-center text-gray-700">
                  {line.hsn || "-"}
                </td>
                <td className="border-r border-gray-400 p-2 text-right text-gray-800">
                  {formatCurrency(line.priceUnit)}
                </td>
                <td className="border-r border-gray-400 p-2 text-right text-gray-800">
                  {line.quantity} <span className="text-[9px] text-gray-500">{line.uom || "NOS"}</span>
                </td>
                <td className="p-2 text-right font-medium text-gray-900">
                  {formatCurrency(line.priceSubtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Section */}
        <div className="flex border-b-2 border-gray-800">
          <div className="w-[60%] p-4 border-r-2 border-gray-800 flex flex-col justify-end">
            <div className="text-[10px] text-gray-600 mb-1">
              Total Items / Qty : {data.invoiceLines?.length || 0} /{" "}
              {data.invoiceLines
                ?.reduce((a: number, b: any) => a + (b.quantity || 0), 0)
                .toFixed(3)}
            </div>
            <div className="font-semibold text-gray-800 text-[10.5px]">
              Total amount (in words): INR {numberToWords(data.amountTotal)} Rupees
              Only.
            </div>
          </div>
          <div className="w-[40%] p-0">
            <table className="w-full">
              <tbody>
                <tr className="border-b border-gray-300">
                  <td className="p-2 text-right font-bold text-gray-700">Taxable Amount</td>
                  <td className="p-2 text-right font-medium text-gray-900">
                    {formatCurrency(data.amountUntaxed)}
                  </td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 text-right font-bold text-gray-700">Total Tax</td>
                  <td className="p-2 text-right font-medium text-gray-900">
                    {formatCurrency(data.amountTax)}
                  </td>
                </tr>
                <tr className="bg-gray-100 border-b-2 border-gray-800">
                  <td className="p-2.5 text-right font-black text-sm text-gray-900">
                    Total
                  </td>
                  <td className="p-2.5 text-right font-black text-sm text-gray-900">
                    {formatCurrency(data.amountTotal)}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 text-right font-bold text-green-700">
                    Amount Paid
                  </td>
                  <td className="p-2 text-right font-bold text-green-700">
                    {formatCurrency(
                      (data.amountTotal || 0) - (data.amountResidual || 0)
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer details (Bank, UPI, Notes) */}
        <div className="flex border-b-2 border-gray-800">
          <div className="w-2/3 p-4 border-r-2 border-gray-800 flex justify-between">
            <div className="flex-1 pr-4 border-r border-dashed border-gray-300">
              <div className="font-bold mb-2 text-gray-800">Bank Details:</div>
              <div className="grid grid-cols-[70px_1fr] gap-y-1.5 text-[10px]">
                <span className="text-gray-600">Bank:</span>
                <span className="font-bold text-gray-900">HDFC BANK LTD</span>
                <span className="text-gray-600">Account #:</span>
                <span className="font-bold text-gray-900">50200012345678</span>
                <span className="text-gray-600">IFSC:</span>
                <span className="font-bold text-gray-900">HDFC0001234</span>
                <span className="text-gray-600">Branch:</span>
                <span className="font-bold text-gray-900">Main Branch</span>
              </div>
            </div>
            <div className="w-[120px] pl-4 flex flex-col items-center justify-center">
              <div className="font-bold mb-1.5 text-center w-full text-[10px] text-gray-800">
                Pay using UPI:
              </div>
              <div className="w-20 h-20 border bg-white p-1 flex items-center justify-center relative overflow-hidden">
                <svg viewBox="0 0 100 100" className="w-full h-full fill-gray-800">
                  <path d="M10,10 h30 v30 h-30 z M15,15 h20 v20 h-20 z M20,20 h10 v10 h-10 z" />
                  <path d="M60,10 h30 v30 h-30 z M65,15 h20 v20 h-20 z M70,20 h10 v10 h-10 z" />
                  <path d="M10,60 h30 v30 h-30 z M15,65 h20 v20 h-20 z M20,70 h10 v10 h-10 z" />
                  <rect x="50" y="50" width="10" height="10" />
                  <rect x="70" y="60" width="10" height="10" />
                  <rect x="80" y="70" width="10" height="10" />
                  <rect x="50" y="80" width="10" height="10" />
                  <rect x="60" y="70" width="10" height="10" />
                  <rect x="80" y="50" width="10" height="10" />
                  <rect x="90" y="60" width="10" height="10" />
                  <rect x="70" y="80" width="10" height="10" />
                  <rect x="90" y="80" width="10" height="10" />
                </svg>
              </div>
            </div>
          </div>
          <div className="w-1/3 p-4 flex flex-col justify-end items-end relative">
            <div className="text-[10px] font-bold text-gray-800 mb-8 absolute top-4 right-4">
              For {companyName}
            </div>
            <div className="w-20 h-20 border-2 border-[#0047AB] rounded-full flex flex-col items-center justify-center text-[#0047AB] font-bold opacity-40 rotate-[-15deg] mb-2">
              <span className="text-[7px] leading-tight">AUTHORIZED</span>
              <span className="text-[8px] leading-tight">SIGNATORY</span>
            </div>
            <div className="text-[9px] text-gray-500 border-t border-gray-300 pt-1 w-full text-right mt-2">
              Authorized Signatory
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50/50">
          <div className="font-bold mb-1 text-[10px] text-gray-800">Notes:</div>
          <div className="mb-4 text-gray-700 italic">
            {data.narration || "Thank you for shopping with us! We appreciate your business."}
          </div>
          <div className="font-bold mb-1 text-[10px] text-gray-800">
            Terms and Conditions:
          </div>
          <ol className="list-decimal list-inside text-gray-600 text-[9.5px] leading-relaxed">
            <li>All disputes must be reported within 15 days of invoice receipt.</li>
            <li>Accepted payment methods include bank transfer, credit card, and UPI.</li>
            <li>In case of exchange, we only accept original receipt.</li>
            <li>Subject to local Jurisdiction.</li>
          </ol>
        </div>
      </div>

      <div className="mt-4 flex justify-between text-[9px] text-gray-500 font-medium">
        <span>Page 1 / 1</span>
        <span>This is a digitally signed document.</span>
      </div>
    </div>
  );
}
