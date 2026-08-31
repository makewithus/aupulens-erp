"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { SALES_PAGE_TITLE_CLASS } from "@/components/sales/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayCircle, Link2, Search, RefreshCw, FileText } from "lucide-react";
import { EInvoiceConnectWizard } from "@/components/sales/einvoices/EInvoiceConnectWizard";
import { EINVOICE_STATUS } from "@/lib/constants/statuses";

// TODO: replace with the final YouTube tutorial link.
const EINVOICE_TUTORIAL_VIDEO_URL = "https://www.youtube.com/embed/dQw4w9WgXcQ";

const TABS = [
  { key: "all", label: "All E-Invoices" },
  { key: EINVOICE_STATUS.SUCCESS, label: "Success" },
  { key: EINVOICE_STATUS.PENDING, label: "Pending" },
  { key: EINVOICE_STATUS.FAILED, label: "Failed" },
  { key: EINVOICE_STATUS.CANCELLED, label: "Cancelled" },
];

const RANGE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
];

const statusColors: Record<string, string> = {
  [EINVOICE_STATUS.SUCCESS]: "text-emerald-500",
  [EINVOICE_STATUS.FAILED]: "text-red-500",
  [EINVOICE_STATUS.CANCELLED]: "text-muted-foreground",
  [EINVOICE_STATUS.PENDING]: "text-amber-500",
};

const LIMIT = 10;

export default function EInvoicingPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [range, setRange] = useState("this_year");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [gspStatus, setGspStatus] = useState<{ status: string; username?: string } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeTab, range, dateFrom, dateTo]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: activeTab, search: debouncedSearch, range, page: String(page), limit: String(LIMIT) });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/sales/e-invoices?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.data);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      } else {
        toast.error(data.message || "Failed to load e-invoices");
      }
    } catch {
      toast.error("Failed to load e-invoices");
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, range, page, dateFrom, dateTo]);

  const fetchGspStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/e-invoices/gsp/status");
      const data = await res.json();
      if (data.success) setGspStatus(data.data);
    } catch {
      // Connection status is non-critical; leave as unknown on failure.
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetchGspStatus();
  }, [fetchGspStatus]);

  const handleGenerate = async (invoiceId: string) => {
    setGeneratingId(invoiceId);
    try {
      const res = await fetch(`/api/sales/e-invoices/${invoiceId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to generate e-invoice");
      toast.success("E-Invoice generated");
      fetchRecords();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate e-invoice");
    } finally {
      setGeneratingId(null);
    }
  };

  const isConnected = gspStatus?.status === "connected";

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-full max-w-xl aspect-video mb-6 rounded-none overflow-hidden border border-border/40">
        <iframe
          className="w-full h-full"
          src={EINVOICE_TUTORIAL_VIDEO_URL}
          title="Generate E-Invoice tutorial"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground mb-3">Generate E-Invoice in less than 10 seconds</h2>
      <p className="text-sm text-emerald-500 max-w-md mb-6">
        Connect using your <span className="font-semibold">NIC credentials</span> and start creating E-Invoices from{" "}
        <span className="font-semibold">Sales</span> section in one click.
      </p>
      <Link href="/sales/invoices">
        <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
          Go to Sales
        </Button>
      </Link>
    </div>
  );

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="E-Invoices"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "E-Invoices" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-center gap-3">
            <h1 className={SALES_PAGE_TITLE_CLASS}>
              E-Invoicing
            </h1>
            <PlayCircle className="w-8 h-8 text-muted-foreground/50" />
          </div>
          {isConnected ? (
            <Badge className="rounded-none border-0 bg-transparent px-0 font-mono text-[12px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none text-emerald-500">
              Connected {gspStatus?.username ? `as ${gspStatus.username}` : ""}
            </Badge>
          ) : (
            <Button
              className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer"
              onClick={() => setWizardOpen(true)}
            >
              <Link2 className="w-4 h-4 mr-2" /> Connect to E-Invoicing Portal
            </Button>
          )}
        </div>

        <div className="flex items-center gap-6 border-b border-border/40 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 font-mono text-[11px] uppercase tracking-[0.12em] border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35" />
            <Input
              placeholder="Search E-Invoices"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:ring-0 w-full text-foreground"
            />
          </div>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-11 w-44 rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border/30">
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-none border-border/40" onClick={fetchRecords} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {!loading && records.length === 0 && !debouncedSearch && activeTab === "all" && range === "this_year" && !dateFrom && !dateTo ? (
          renderEmptyState()
        ) : (
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Amount</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Status</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Invoice #</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Ack No.</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Customer</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Date/Created Time</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell className="px-8 py-7"><Skeleton className="h-8 w-16" /></TableCell>
                      </TableRow>
                    ))
                  ) : records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                        No e-invoices match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((r) => {
                      const invoice = r.invoiceId || {};
                      const customerName =
                        invoice.customerId?.header?.name || invoice.customerId?.contact_details?.email || "—";
                      return (
                        <TableRow key={r._id} className="group transition-colors duration-300 hover:bg-white/[0.015]">
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm text-foreground">
                            ₹{Number(r.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[12px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[r.status] || "text-muted-foreground"}`}>
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">
                            {invoice.number || "—"}
                          </TableCell>
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                            {r.ackNo || "—"}
                          </TableCell>
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                            {customerName}
                          </TableCell>
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                            {new Date(r.createdAt).toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="px-8 py-7">
                            {(r.status === EINVOICE_STATUS.PENDING || r.status === EINVOICE_STATUS.FAILED) && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={generatingId === invoice._id}
                                onClick={() => handleGenerate(invoice._id)}
                                className="h-8 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider"
                              >
                                {generatingId === invoice._id ? "Generating..." : "Retry"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <span className="text-sm">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <EInvoiceConnectWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onConnected={() => {
          fetchGspStatus();
          fetchRecords();
        }}
      />
    </DashboardLayout>
  );
}
