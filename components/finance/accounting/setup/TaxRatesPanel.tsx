"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { AccountPicker, type PickerAccount } from "@/components/finance/accounting/AccountPicker";

export function TaxRatesPanel({ type }: { type: "gst" | "tds" | "tcs" }) {
  const [rates, setRates] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<PickerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [ratePercent, setRatePercent] = useState(0);
  const [appliesTo, setAppliesTo] = useState<"sales" | "purchase" | "both">("both");
  const [sectionCode, setSectionCode] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/accounting/tax-rates?type=${type}`);
      const data = await res.json();
      if (data.success) setRates(data.data);
    } catch {
      toast.error("Failed to load rates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    fetch("/api/finance/accounting/accounts?view=active")
      .then((r) => r.json())
      .then((d) => setAccounts((d.accounts || []).map((a: any) => ({ _id: a._id, accountName: a.accountName, accountCode: a.accountCode }))))
      .catch(() => {});
  }, [type]);

  const handleAdd = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/finance/accounting/tax-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, ratePercent, appliesTo, sectionCode: sectionCode || undefined, accountId: accountId || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to add rate");
      toast.success("Rate added");
      setName("");
      setRatePercent(0);
      setSectionCode("");
      setAccountId("");
      fetchRates();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Delete rate?" });
    if (!ok) return;
    const res = await fetch(`/api/finance/accounting/tax-rates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("Deleted");
      fetchRates();
    } else toast.error(data.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-40" placeholder={type === "gst" ? "GST 18%" : "Section 194C"} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Rate (%)</label>
          <Input type="number" value={ratePercent} onChange={(e) => setRatePercent(Number(e.target.value) || 0)} className="w-24" />
        </div>
        {type === "gst" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Applies To</label>
            <Select value={appliesTo} onValueChange={(v: any) => setAppliesTo(v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {type !== "gst" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Section Code</label>
            <Input value={sectionCode} onChange={(e) => setSectionCode(e.target.value)} className="w-32" placeholder="194C" />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Linked Account</label>
          <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} placeholder="Optional" className="w-56" />
        </div>
        <Button onClick={handleAdd} disabled={saving}>
          <Plus className="h-4 w-4 mr-2" /> Add Rate
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>NAME</TableHead>
            <TableHead>RATE</TableHead>
            {type === "gst" ? <TableHead>APPLIES TO</TableHead> : <TableHead>SECTION</TableHead>}
            <TableHead>ACCOUNT</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-6">
                Loading...
              </TableCell>
            </TableRow>
          ) : rates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                No rates defined yet.
              </TableCell>
            </TableRow>
          ) : (
            rates.map((r) => (
              <TableRow key={r._id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.ratePercent}%</TableCell>
                <TableCell className="capitalize">{type === "gst" ? r.appliesTo : r.sectionCode || "-"}</TableCell>
                <TableCell>{r.accountId?.accountName || "-"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(r._id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
