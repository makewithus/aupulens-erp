"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Link2, Search, RefreshCw } from "lucide-react";
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

function statusColor(status: string) {
  switch (status) {
    case EINVOICE_STATUS.SUCCESS:
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800";
    case EINVOICE_STATUS.FAILED:
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800";
    case EINVOICE_STATUS.CANCELLED:
      return "bg-accent text-muted-foreground border-border dark:bg-accent dark:border-border";
    default:
      return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800";
  }
}

export default function EInvoicingPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("this_year");
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [gspStatus, setGspStatus] = useState<{ status: string; username?: string } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: activeTab, search, range });
      const res = await fetch(`/api/sales/e-invoices?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.data);
      } else {
        toast.error(data.message || "Failed to load e-invoices");
      }
    } catch {
      toast.error("Failed to load e-invoices");
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, range]);

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
      <div className="w-full max-w-xl aspect-video mb-6 rounded-none overflow-hidden border">
        <iframe
          className="w-full h-full"
          src={EINVOICE_TUTORIAL_VIDEO_URL}
          title="Generate E-Invoice tutorial"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <h2 className="text-xl font-bold mb-3">Generate E-Invoice in less than 10 seconds 🚀</h2>
      <p className="text-sm text-green-600 dark:text-green-400 max-w-md mb-6">
        Connect using your <span className="font-semibold">NIC credentials</span> and start creating E-Invoices from{" "}
        <span className="font-semibold">Sales</span> section in one-click.
      </p>
      <Link href="/sales/invoices">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">Go to Sales</Button>
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
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            E-Invoicing
            <PlayCircle className="w-5 h-5 text-blue-600" />
          </h1>
          {isConnected ? (
            <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800 px-3 py-1.5">
              Connected {gspStatus?.username ? `as ${gspStatus.username}` : ""}
            </Badge>
          ) : (
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setWizardOpen(true)}>
              <Link2 className="w-4 h-4 mr-2" /> Connect to E-Invoicing Portal
            </Button>
          )}
        </div>

        <div className="flex items-center gap-6 border-b">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search E-Invoices"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchRecords} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : records.length === 0 ? (
          renderEmptyState()
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Ack No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date/Created Time</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => {
                const invoice = r.invoiceId || {};
                const customerName =
                  invoice.customerId?.header?.name || invoice.customerId?.contact_details?.email || "—";
                return (
                  <TableRow key={r._id}>
                    <TableCell>₹{Number(r.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-none border capitalize ${statusColor(r.status)}`}>
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>{invoice.number || "—"}</TableCell>
                    <TableCell>{r.ackNo || "—"}</TableCell>
                    <TableCell>{customerName}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      {(r.status === EINVOICE_STATUS.PENDING || r.status === EINVOICE_STATUS.FAILED) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={generatingId === invoice._id}
                          onClick={() => handleGenerate(invoice._id)}
                        >
                          {generatingId === invoice._id ? "Generating..." : "Retry"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
