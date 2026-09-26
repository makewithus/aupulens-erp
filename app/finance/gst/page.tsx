"use client";
import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

type GstHead = "cgst" | "sgst" | "igst";
type GstBalances = Record<GstHead, number>;
type GstLedgerSummary = {
  input: GstBalances;
  output: GstBalances;
  unclassifiedOutput: number;
  remainingCredit: GstBalances;
  cashPayable: GstBalances;
  totalCreditUsed: number;
  totalCashPayable: number;
};

function previousCompletedMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export default function GstPage() {
  const { data: session } = useSession();
  const [period, setPeriod] = useState(previousCompletedMonth);
  const [data, setData] = useState<GstLedgerSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setData(null);
    const res = await fetch(`/api/finance/gst?period=${period}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    setData(json.data);
  }, [period]);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);
  const apply = async () => {
    if (busy || !data) return;
    setBusy(true);
    try {
      const res = await fetch("/api/finance/gst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, expected: JSON.stringify(data) }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("GST input credit adjustment posted"); await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const money = (n: number) => n.toLocaleString("en-IN", { style: "currency", currency: "INR" });
  return <DashboardLayout sidebarSections={financeSidebarConfig} companyName="Aupulens" dashboardTitle="Finance" pageName="GST & Input Credit" userName={session?.user?.name || "User"} userEmail={session?.user?.email || ""} userRole={session?.user?.role || "finance"}>
    <div className="p-6 space-y-6"><h1 className="text-3xl">GST & Input Credit</h1>
      <label>Balances through month end <input type="month" className="border p-2 bg-background" value={period} disabled={busy} onChange={(e) => setPeriod(e.target.value)} /></label>
      <p>Posted GST ledger balances include unused credit carried from earlier months. Review purchase eligibility before posting a setoff. This records the accounting adjustment; it does not file a GST return or pay the government.</p>
      {data && <><table className="w-full text-left"><thead><tr>{["Tax", "Input credit", "Output liability", "Credit remaining", "Cash payable"].map((s) => <th className="p-3 border-b" key={s}>{s}</th>)}</tr></thead><tbody>{(["cgst", "sgst", "igst"] as const).map((head) => <tr key={head}><td className="p-3">{head.toUpperCase()}</td>{[data.input[head], data.output[head], data.remainingCredit[head], data.cashPayable[head]].map((v, i) => <td className="p-3" key={i}>{money(v)}</td>)}</tr>)}</tbody></table>
        {data.unclassifiedOutput !== 0 && <p className="text-amber-600">Legacy GST requiring classification: {money(data.unclassifiedOutput)}. Reclassify it in Journal Entries before applying credit.</p>}
        <p>Credit to apply: {money(data.totalCreditUsed)} · Net cash payable: {money(data.totalCashPayable)}</p>
        <Button disabled={busy || !data.totalCreditUsed || !!data.unclassifiedOutput} onClick={apply}>{busy ? "Posting…" : "Post reviewed input credit adjustment"}</Button>
      </>}
    </div>
  </DashboardLayout>;
}
