"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Plus,
  MoreHorizontal,
  ChevronDown,
  Star,
  RefreshCw,
  Columns,
  Wallet,
  CreditCard,
  Landmark,
  HandCoins,
  ListChecks,
  SlidersHorizontal,
} from "lucide-react";
import { ExportInvoicePaymentsDialog } from "@/components/sales/payments/ExportInvoicePaymentsDialog";
import { ExportCurrentViewDialog } from "@/components/sales/payments/ExportCurrentViewDialog";
import { ManageCustomFieldsDrawer } from "@/components/sales/payments/ManageCustomFieldsDrawer";
import { AVAILABLE_PAYMENT_COLUMNS } from "@/lib/sales/paymentViews";

const SORT_FIELDS = [
  { key: "createdAt", label: "Created Time" },
  { key: "updatedAt", label: "Last Modified Time" },
  { key: "paymentDate", label: "Date" },
  { key: "paymentNumber", label: "Payment#" },
  { key: "customerId", label: "Customer Name" },
  { key: "amountReceived", label: "Amount" },
  { key: "mode", label: "Mode" },
];

function statusColor(status: string) {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800";
    case "draft":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800";
    case "void":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800";
    default:
      return "bg-accent text-muted-foreground border-border dark:bg-accent dark:border-border";
  }
}

function LifecycleDiagram() {
  return (
    <div className="bg-muted/30 border rounded-none p-8">
      <h3 className="text-sm font-semibold text-center mb-8">Life cycle of a Customer Payment</h3>
      <div className="flex flex-col items-center gap-6">
        <div className="flex border rounded-none bg-background">
          {["INITIAL REQUEST", "REMINDER 1", "REMINDER 2", "REMINDER N"].map((label, i) => (
            <div
              key={label}
              className={`px-5 py-2.5 text-xs font-semibold whitespace-nowrap ${i > 0 ? "border-l" : ""}`}
            >
              {label}
            </div>
          ))}
        </div>
        <span className="text-muted-foreground text-xs">┊</span>
        <div className="flex items-center gap-6 flex-wrap justify-center">
          {[
            { icon: Wallet, label: "PAYPAL" },
            { icon: CreditCard, label: "CREDIT CARD" },
            { icon: Landmark, label: "BANK" },
            { icon: HandCoins, label: "MANUAL / OFFLINE" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 border rounded-none px-4 py-2.5 bg-background">
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          PAID THROUGH <span className="text-red-600 font-semibold">CLIENT PORTAL</span> (PayPal, Credit Card, Bank)
        </p>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [viewSearch, setViewSearch] = useState("");
  const [sortField, setSortField] = useState("paymentDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportViewOpen, setExportViewOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);

  const activeView = views.find((v) => v._id === activeViewId);
  const extraColumns: string[] = activeView?.columns?.length ? activeView.columns : [];

  const fetchViews = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/sales/payment-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All Payments");
        if (allView) setActiveViewId((cur) => (cur === "all" ? allView._id : cur));
      }
    } catch {
      // Non-critical
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeViewId && activeViewId !== "all") params.set("viewId", activeViewId);
      params.set("sortField", sortField);
      params.set("sortDir", sortDir);
      const res = await cachedFetch(`/api/sales/payments?${params.toString()}`);
      const json = await res.json();
      if (json.success) setPayments(json.data || []);
      else toast.error(json.message || "Failed to load payments");
    } catch (error) {
      console.error("Error loading payments:", error);
      toast.error("Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [activeViewId, sortField, sortDir]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = async (view: any) => {
    await cachedFetch(`/api/sales/payment-views/${view._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !view.isFavorite }),
    });
    fetchViews();
  };

  const setSort = (key: string) => {
    if (key === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(key);
      setSortDir("desc");
    }
  };

  const getPath = (obj: any, path: string) => path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  const columnLabel = (key: string) => AVAILABLE_PAYMENT_COLUMNS.find((c) => c.key === key)?.label || key;
  const filteredViews = views.filter((v) => v.name.toLowerCase().includes(viewSearch.toLowerCase()));

  const extraValue = (p: any, key: string) => {
    if (key === "invoiceNumbers") {
      return (p.allocations || []).map((a: any) => a.invoiceId?.number).filter(Boolean).join(", ") || "—";
    }
    return String(getPath(p, key) ?? "—");
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-lg font-bold">
                {activeView?.name || "All Received Payments"} <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <div className="p-2">
                <Input placeholder="Search views" value={viewSearch} onChange={(e) => setViewSearch(e.target.value)} className="h-8" />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {filteredViews.map((v) => (
                  <DropdownMenuItem key={v._id} className="flex items-center justify-between" onClick={() => setActiveViewId(v._id)}>
                    <span>{v.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(v);
                      }}
                    >
                      <Star className={`w-3.5 h-3.5 ${v.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                    </button>
                  </DropdownMenuItem>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/sales/payments/views/new")}>
                <Plus className="w-4 h-4 mr-2" /> New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <Link href="/sales/payments/new">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-1" /> New
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Sort by</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {SORT_FIELDS.map((f) => (
                      <DropdownMenuItem key={f.key} onClick={() => setSort(f.key)}>
                        {f.label} {sortField === f.key && (sortDir === "asc" ? "↑" : "↓")}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Import</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => router.push("/sales/payments/import")}>Import Payments</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/sales/payments/import/retainer")}>
                      Import Retainer Payments
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/sales/payments/import/excess")}>
                      Import Applied Excess Payments
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>Export Invoice Payments</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportViewOpen(true)}>Export Current View</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => setCustomFieldsOpen(true)}>
                  <ListChecks className="w-4 h-4 mr-2" /> Manage Custom Fields
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/sales/payments/online-payment-settings")}>
                  <SlidersHorizontal className="w-4 h-4 mr-2" /> Online Payments
                </DropdownMenuItem>
                <DropdownMenuItem onClick={load}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh List
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Columns className="w-4 h-4 mr-2" /> Reset Column Width
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : payments.length === 0 ? (
          <div className="space-y-10">
            <div className="flex flex-col items-center py-16 px-4 text-center">
              <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <Wallet className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">No payments received, yet</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Payments will be added once your customers pay for their invoices.
              </p>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => router.push("/sales/invoices?status=saved")}
              >
                GO TO UNPAID INVOICES
              </Button>
              <button className="text-sm text-blue-600 underline mt-4" onClick={() => router.push("/sales/payments/import")}>
                Import Payments
              </button>
            </div>
            <LifecycleDiagram />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer Name</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {extraColumns.map((key) => (
                  <TableHead key={key}>{columnLabel(key)}</TableHead>
                ))}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p: any) => (
                <TableRow
                  key={p._id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(`/sales/payments/${p._id}`)}
                >
                  <TableCell>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("en-IN") : "—"}</TableCell>
                  <TableCell className="font-medium">
                    {p.customerId?.header?.displayName || p.customerId?.header?.name || "—"}
                  </TableCell>
                  <TableCell>{p.mode}</TableCell>
                  <TableCell className="text-right">
                    ₹{Number(p.amountReceived || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  {extraColumns.map((key) => (
                    <TableCell key={key}>{extraValue(p, key)}</TableCell>
                  ))}
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-none border capitalize ${statusColor(p.status)}`}>
                      {p.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ExportInvoicePaymentsDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportCurrentViewDialog
        open={exportViewOpen}
        onOpenChange={setExportViewOpen}
        viewId={activeViewId}
        viewName={activeView?.name}
      />
      <ManageCustomFieldsDrawer open={customFieldsOpen} onOpenChange={setCustomFieldsOpen} />
    </DashboardLayout>
  );
}
