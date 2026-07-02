"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";
import { FindAccountantsSheet } from "@/components/finance/accounting/FindAccountantsSheet";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users } from "lucide-react";
import { DateField } from "@/components/finance/accounting/DateField";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
];

export default function CurrencyAdjustmentsPage() {
  const { data: session } = useSession();
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("this_month");
  const [accountantsOpen, setAccountantsOpen] = useState(false);

  const [currencies, setCurrencies] = useState<{ code: string; symbol: string; name: string }[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("INR");
  const [modalOpen, setModalOpen] = useState(false);
  const [currency, setCurrency] = useState("");
  const [dateOfAdjustment, setDateOfAdjustment] = useState(new Date().toISOString().slice(0, 10));
  const [exchangeRate, setExchangeRate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchAdjustments = async (f: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/accounting/currency-adjustments?filter=${f}`);
      const data = await res.json();
      if (data.success) setAdjustments(data.data);
    } catch {
      toast.error("Failed to load currency adjustments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdjustments(filter);
  }, [filter]);

  useEffect(() => {
    fetch("/api/finance/accounting/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const list = (d.data?.currency?.enabledCurrencies || []).filter((c: any) => c.code !== d.data.currency.baseCurrency);
          setCurrencies(list);
          setBaseCurrency(d.data.currency.baseCurrency);
          if (list.length) setCurrency(list[0].code);
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!currency || !dateOfAdjustment || !exchangeRate || !notes.trim()) {
      return toast.error("Currency, Date of Adjustment, Exchange Rate, and Notes are all required");
    }
    setSaving(true);
    try {
      const res = await fetch("/api/finance/accounting/currency-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, dateOfAdjustment, exchangeRate: Number(exchangeRate), notes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save adjustment");
      toast.success("Currency adjustment recorded");
      setModalOpen(false);
      setNotes("");
      setExchangeRate("");
      fetchAdjustments(filter);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Currency Adjustments"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "Accounting" }, { label: "Currency Adjustments" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <AccountingSubNav />

        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Base Currency Adjustments</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAccountantsOpen(true)}>
              <Users className="h-4 w-4 mr-2" /> Find Accountants
            </Button>
            <Button onClick={() => setModalOpen(true)} disabled={currencies.length === 0}>
              + New
            </Button>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Filter By: {FILTERS.find((f) => f.value === filter)?.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {FILTERS.map((f) => (
              <DropdownMenuItem key={f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DATE</TableHead>
                <TableHead>CURRENCY</TableHead>
                <TableHead>EXCHANGE RATE</TableHead>
                <TableHead>GAIN OR LOSS</TableHead>
                <TableHead>NOTES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : adjustments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Record a Base Currency Adjustment to correct fluctuations in exchange rates
                  </TableCell>
                </TableRow>
              ) : (
                adjustments.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>{new Date(a.dateOfAdjustment).toLocaleDateString()}</TableCell>
                    <TableCell>{a.currency}</TableCell>
                    <TableCell>
                      1 {a.currency} = {a.exchangeRate} {a.baseCurrency}
                    </TableCell>
                    <TableCell className={a.gainOrLoss > 0 ? "text-green-500" : a.gainOrLoss < 0 ? "text-red-500" : ""}>
                      {a.gainOrLoss > 0 ? "+" : ""}
                      {a.gainOrLoss.toFixed(2)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{a.notes}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Base Currency Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-red-500">Currency*</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}- {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-red-500">Date of Adjustment*</label>
              <DateField value={dateOfAdjustment} onChange={setDateOfAdjustment} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-red-500">Exchange Rate*</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">1 {currency || "—"} =</span>
                <input
                  type="number"
                  step="0.000001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                />
                <span className="text-sm text-muted-foreground shrink-0">{baseCurrency}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-red-500">Notes*</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Max. 500 characters" maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FindAccountantsSheet open={accountantsOpen} onOpenChange={setAccountantsOpen} />
    </DashboardLayout>
  );
}
