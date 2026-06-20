'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import QuoteBuilder from "@/components/crm/QuoteBuilder";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";

interface SelectOption {
  _id: string;
  label: string;
}

function SearchSelect({
  label,
  required,
  value,
  onChange,
  fetchUrl,
  labelKey,
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (id: string) => void;
  fetchUrl: string;
  labelKey: string | ((item: any) => string);
  placeholder: string;
}) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const url = search ? `${fetchUrl}&search=${encodeURIComponent(search)}` : fetchUrl;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          let arrayData = [];
          if (Array.isArray(d.data)) {
            arrayData = d.data;
          } else if (d.data && typeof d.data === 'object') {
            const key = Object.keys(d.data).find((k) => Array.isArray(d.data[k]));
            if (key) arrayData = d.data[key];
          }
          
          setOptions(
            arrayData.slice(0, 20).map((item: any) => ({
              _id: item._id,
              label:
                typeof labelKey === "function" ? labelKey(item) : item[labelKey],
            }))
          );
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, fetchUrl]);

  const selected = options.find((o) => o._id === value);

  return (
    <div className="relative">
      <label className="text-sm font-medium block mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div
        className="flex items-center border border-neutral-700 rounded bg-neutral-950 cursor-pointer px-3 h-9"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`flex-1 text-sm ${selected ? "" : "text-neutral-500"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <Search className="w-3.5 h-3.5 text-neutral-500" />
      </div>

      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded shadow-xl">
          <div className="p-2 border-b border-neutral-800">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="h-7 text-sm bg-neutral-950 border-neutral-700"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading && (
              <div className="text-xs text-neutral-500 p-2">Loading...</div>
            )}
            {!loading && options.length === 0 && (
              <div className="text-xs text-neutral-500 p-2">No results.</div>
            )}
            {options.map((opt) => (
              <div
                key={opt._id}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-neutral-800 ${
                  value === opt._id ? "bg-primary/20 text-primary" : ""
                }`}
                onClick={() => {
                  onChange(opt._id);
                  setOpen(false);
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewQuotePage() {
  const [oppId, setOppId] = useState("");
  const [accId, setAccId] = useState("");
  const [quoteNum, setQuoteNum] = useState(
    `QT-${Date.now().toString(36).toUpperCase().slice(-6)}`
  );
  const router = useRouter();

  const handleSave = async (data: any) => {
    if (!oppId || !accId) {
      toast.error("Please select an Opportunity and Account.");
      return;
    }

    const payload = {
      quote_number: quoteNum,
      opportunity_id: oppId,
      account_id: accId,
      ...data,
    };

    const res = await fetch("/api/crm/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    if (res.ok) {
      toast.success(data.submitForApproval ? "Quote submitted for approval!" : "Draft saved!");
      router.push(`/crm/quotes/${result.data._id}`);
    } else {
      toast.error(result.message || "Failed to create quote");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back nav */}
      <Link href="/crm/quotes">
        <Button variant="ghost" size="sm" className="h-8 text-xs -ml-2">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Quotes
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Create New Quote</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Build a quote with line items, discounts, and submit for approval.
        </p>
      </div>

      {/* Meta fields */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4">
        <h2 className="font-semibold">Quote Details</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Quote Number</label>
            <Input
              value={quoteNum}
              onChange={(e) => setQuoteNum(e.target.value)}
              className="bg-neutral-950 border-neutral-700"
            />
          </div>
          <SearchSelect
            label="Opportunity"
            required
            value={oppId}
            onChange={setOppId}
            fetchUrl="/api/crm/opportunities?"
            labelKey={(item) =>
              `${item.deal_name} — $${item.amount?.toLocaleString() || 0}`
            }
            placeholder="Select opportunity..."
          />
          <SearchSelect
            label="Account"
            required
            value={accId}
            onChange={setAccId}
            fetchUrl="/api/crm/accounts?"
            labelKey="company_name"
            placeholder="Select account..."
          />
        </div>
      </div>

      {/* Quote builder */}
      <QuoteBuilder onSave={handleSave} oppId={oppId} accountId={accId} />
    </div>
  );
}
