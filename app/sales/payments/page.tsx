"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, MoreHorizontal, CreditCard, RefreshCw } from "lucide-react";

export default function PaymentsPage() {
  const { data: session } = useSession();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [form, setForm] = useState({ invoiceId: "", amount: "", date: new Date().toISOString().slice(0, 10), mode: "Cash", notes: "" });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/payments?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.success) setRows(data.data);
    } catch {
      toast.error("Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const openRecordPayment = async () => {
    try {
      const res = await fetch("/api/sales/invoices?limit=100");
      const data = await res.json();
      if (data.success) setInvoices(data.data);
    } catch {
      toast.error("Failed to load invoices");
    }
    setRecordOpen(true);
  };

  const handleSave = async () => {
    if (!form.invoiceId || !form.amount) {
      toast.error("Invoice and amount are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to record payment");
      toast.success("Payment recorded");
      setRecordOpen(false);
      setForm({ invoiceId: "", amount: "", date: new Date().toISOString().slice(0, 10), mode: "Cash", notes: "" });
      fetchRows();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Payments"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Payments" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-1">
            All Payments
          </h1>
          <div className="flex items-center gap-2">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openRecordPayment}>
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={fetchRows}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search payments" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
              <CreditCard className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No payments recorded yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Payments recorded against your invoices will show up here.
            </p>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openRecordPayment}>
              <Plus className="w-4 h-4 mr-1" /> Record Payment
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.invoiceNumber}</TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>₹{Number(r.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>{new Date(r.date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>{r.mode}</TableCell>
                  <TableCell className="text-muted-foreground">{r.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold mb-4">Record Payment</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Invoice *</Label>
              <Select value={form.invoiceId} onValueChange={(v) => setForm((f) => ({ ...f, invoiceId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((inv) => (
                    <SelectItem key={inv._id} value={inv._id}>
                      {inv.number} — ₹{Number(inv.totalAmount).toLocaleString("en-IN")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank">Bank</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setRecordOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
