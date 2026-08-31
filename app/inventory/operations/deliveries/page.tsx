"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  RefreshCw,
  Eye,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { StockTransferPopup } from "@/app/inventory/operations/popups/StockTransferPopup";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";

interface InventoryTransfer {
  _id: string;
  status: string;
  qcStatus?: string;
  pickStatus?: string;
  packStatus?: string;
  header: {
    name: string;
    scheduledDate: string;
    partnerName?: string;
    partnerId?: {
      name?: string;
      header?: {
        name?: string;
      };
    };
  };
}

const statusColors: Record<string, string> = {
  draft: "text-muted-foreground",
  pending_approval: "text-blue-500",
  approved: "text-cyan-500",
  posted: "text-emerald-500",
  closed: "text-purple-500",
};

const LIMIT = 10;

export default function DeliveriesPage() {
  return (
    <Suspense fallback={null}>
      <DeliveriesPageInner />
    </Suspense>
  );
}

function DeliveriesPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  // Separate, unpaginated fetch used only for the KPI cards — those need
  // totals across every matching delivery, not just the current page of 10.
  const [allTransfers, setAllTransfers] = useState<InventoryTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters state
  // AI-native "redirect with filters" support — seeded from the URL
  // synchronously (lazy useState initializer) so the very first fetch
  // already uses them. A normal, param-less visit just gets the defaults
  // below, unchanged. This used to seed via a separate useEffect after
  // mount, which let an initial unfiltered fetch fire and render before the
  // filtered one landed: a visible flash of the wrong rows on every
  // filtered redirect. `debouncedSearch` is seeded too (not just
  // `searchQuery`) so a seeded search term doesn't wait out its normal
  // 300ms typing-debounce before the first fetch uses it.
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") || "");

  // Resources
  const [partners, setPartners] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  // Customer Modal
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [partnerFormData, setPartnerFormData] = useState<any>({
    header: { name: "", company_type: "company", is_company: true },
    contact_details: { email: "", phone: "", mobile: "", website: "" },
    address_tab: { type: "contact", street: "", city: "", zip: "" },
    sales_purchase_tab: {},
    accounting_tab: {},
  });
  const [partnerTab, setPartnerTab] = useState("address");

  const defaultFormData = {
    header: { name: "", operationType: "outgoing", scheduledDate: new Date() },
    operations_tab: [],
    additional_info: {},
    status: "draft",
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchTransfers();
    }
  }, [status, page, debouncedSearch, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchAllTransfersForStats();
      fetchResources();
    }
  }, [status]);

  const fetchResources = async () => {
    try {
      const [pRes, cRes, uRes] = await Promise.all([
        cachedFetch("/api/sales/products?limit=100"),
        cachedFetch("/api/sales/customers"),
        cachedFetch("/api/users"),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setProducts(d.items || []);
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setPartners(d.items || []);
      }
      if (uRes.ok) {
        const d = await uRes.json();
        setUsers(d.users || []);
      }
    } catch (e) {
      console.error("Failed to fetch resources", e);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ type: "outgoing", page: String(page), limit: String(LIMIT) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await cachedFetch(`/api/inventory/operations/transfers?${params.toString()}`);
      const data = await res.json();
      setTransfers(data.transfers || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      toast.error("Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllTransfersForStats = async () => {
    try {
      const res = await cachedFetch("/api/inventory/operations/transfers?type=outgoing");
      const data = await res.json();
      setAllTransfers(data.transfers || []);
    } catch (e) {
      console.error("Failed to load delivery stats", e);
    }
  };

  const handleAction = (t: any, action: "view" | "edit" | "create") => {
    if (action === "create") {
      setFormData(JSON.parse(JSON.stringify(defaultFormData)));
      setIsViewOnly(false);
    } else {
      setFormData(t);
      setIsViewOnly(action === "view");
    }
    setIsModalOpen(true);
  };

  // AI-native pre-fill: open the New Delivery modal with AI-extracted details.
  useAiPrefill("inventory_delivery", (p) => {
    const d: any = p.data || {};
    const base = JSON.parse(JSON.stringify(defaultFormData));
    const lines = (Array.isArray(d.items) ? d.items : [])
      .filter((it: any) => it && (it.productId || it.name))
      .map((it: any) => ({ productId: it.productId || "", demand: Number(it.qty) > 0 ? Number(it.qty) : 1, done: 0 }));
    setFormData({
      ...base,
      header: {
        ...base.header,
        name: d.reference ? String(d.reference) : base.header.name,
        scheduledDate: d.scheduled_date ? new Date(d.scheduled_date) : base.header.scheduledDate,
        ...(d.partnerId ? { partnerId: String(d.partnerId) } : {}),
      },
      operations_tab: lines.length ? lines : base.operations_tab,
      additional_info: { ...base.additional_info, ...(d.source_document ? { sourceDocument: String(d.source_document) } : {}), ...(d.note ? { note: String(d.note) } : {}) },
    });
    setIsViewOnly(false);
    setIsModalOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 10000 });
  });

  const saveTransfer = async () => {
    setIsSubmitting(true);
    try {
      const url = formData._id
        ? `/api/inventory/operations/transfers/${formData._id}`
        : "/api/inventory/operations/transfers";
      const method = formData._id ? "PATCH" : "POST";
      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Saved");
      setIsModalOpen(false);
      fetchTransfers();
      fetchAllTransfersForStats();
      fetchResources();
    } catch (e) {
      toast.error("Error saving");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await cachedFetch(`/api/inventory/operations/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Status updated");
      fetchTransfers();
      fetchAllTransfersForStats();
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  const updateSubStatus = async (
    id: string,
    payload: Record<string, any>,
  ) => {
    try {
      const res = await cachedFetch(`/api/inventory/operations/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Updated");
      fetchTransfers();
      fetchAllTransfersForStats();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  const getNextAction = (transfer: InventoryTransfer) => {
    switch (transfer.status) {
      case "draft":
        return "Reserve Inventory";

      case "pending_approval":
        if (transfer.pickStatus !== "picked")
          return "Confirm Pick";

        if (transfer.packStatus !== "packed")
          return "Confirm Pack";

        return "Approve";

      case "approved":
        return "Dispatch";

      case "posted":
        return "Close Delivery";

      default:
        return undefined;
    }
  };

  const statusLabels: Record<string, string> = {
    draft: "Draft",
    pending_approval: "Picking & Packing",
    approved: "Approved",
    posted: "Dispatched",
    closed: "Delivered",
  };

  const handleSavePartner = async () => {
    try {
      const res = await cachedFetch("/api/sales/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partnerFormData),
      });
      if (!res.ok) throw new Error("Failed to create customer");
      const created = await res.json();
      toast.success("Customer created");
      setIsPartnerModalOpen(false);
      fetchResources();
      if (formData) {
        setFormData({
          ...formData,
          header: { ...formData.header, partnerId: created.customer._id },
        });
      }
    } catch (e) {
      toast.error("Failed to create customer");
    }
  };

  const handleContinue = (transfer: InventoryTransfer) => {
    switch (transfer.status) {
      case "draft":
        updateStatus(transfer._id, "pending_approval");
        break;

      case "pending_approval":
        if (transfer.pickStatus !== "picked") {
          updateSubStatus(transfer._id, { pickStatus: "picked" });
        } else if (transfer.packStatus !== "packed") {
          updateSubStatus(transfer._id, { packStatus: "packed" });
        } else {
          updateStatus(transfer._id, "approved");
        }
        break;

      case "approved":
        updateStatus(transfer._id, "posted");
        break;

      case "posted":
        updateStatus(transfer._id, "closed");
        break;
    }
  };

  // transfers is already filtered + paginated server-side.
  const filteredTransfers = transfers;

  // Compute KPIs from the full (unpaginated) matching set.
  const kpis = useMemo(() => {
    const totalCount = allTransfers.length;
    const drafts = allTransfers.filter((t) => t.status === "draft").length;
    const pending = allTransfers.filter((t) => t.status !== "closed" && t.status !== "draft").length;
    const completed = allTransfers.filter((t) => t.status === "closed").length;

    return {
      total: totalCount,
      drafts,
      pending,
      completed,
    };
  }, [allTransfers]);

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory"
      pageName="Deliveries"
      breadcrumbs={[
        { label: "Operations", href: "/inventory/summary" },
        { label: "Deliveries" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={() => { fetchTransfers(); fetchAllTransfersForStats(); }}
      profilePath="/inventory/profile"
    >
      <div className="space-y-6">
        {/* Header Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Deliveries
            </h1>
          </div>
          <Button
            onClick={() => handleAction(null, "create")}
            className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[13px] uppercase tracking-wider rounded-none cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Delivery
          </Button>
        </div>

        {/* Stats Row */}
        <div className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Total Deliveries"
              value={kpis.total}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Draft Deliveries"
              value={kpis.drafts}
              visual={<ActivePulse />}
            />
            <StatCard
              title="Pending Picking/Packing"
              value={kpis.pending}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Closed Deliveries"
              value={kpis.completed}
              visual={<ActivePulse />}
            />
          </div>

          {/* Unified Card matching HR Employee structure */}
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            {/* Card Header & Controls Toolbar */}
            <div className="border-b border-border/20 px-8 py-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="shrink-0">
                  <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                    All Deliveries
                  </h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    {total}{" "}
                    {total === 1 ? "Delivery" : "Deliveries"}
                  </p>
                </div>

                {/* Toolbar Controls */}
                <div className="w-full max-w-3xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search deliveries or customers..."
                      className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none transition-all duration-300 placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:bg-white/[0.015] focus-visible:ring-0 w-full text-foreground"
                    />
                  </div>

                  {/* Status Select Filter */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 w-full md:w-[210px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
                      <SelectValue placeholder="Delivery Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="pending_approval">Picking & Packing</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="posted">Dispatched</SelectItem>
                      <SelectItem value="closed">Delivered</SelectItem>
                    </SelectContent>
                  </Select>

                  <DateRangeFilter
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFromChange={setDateFrom}
                    onDateToChange={setDateTo}
                  />
                </div>
              </div>
            </div>

            {/* Table Content */}
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Reference
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Customer
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Scheduled Date
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Status State
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Suggested Action
                    </TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-5 w-36" />
                            <Skeleton className="h-3.5 w-24 opacity-55" />
                          </div>
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-8 w-28" />
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right">
                          <div className="flex justify-end gap-1">
                            <Skeleton className="h-8 w-8" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredTransfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-24 text-center">
                        <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                        <h3 className="text-lg font-medium text-foreground">
                          {searchQuery || statusFilter !== "all" || dateFrom || dateTo
                            ? "No deliveries match your filters"
                            : "No outgoing deliveries found"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {searchQuery || statusFilter !== "all" || dateFrom || dateTo
                            ? "Try adjusting your search or filters."
                            : "Create your first delivery to begin shipping products."}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransfers.map((transfer) => {
                      const customerName =
                        transfer.header.partnerId?.header?.name ||
                        transfer.header.partnerId?.name ||
                        transfer.header.partnerName ||
                        "-";
                      const nextAction = getNextAction(transfer);
                      const isClosed = transfer.status === "closed";

                      return (
                        <TableRow
                          key={transfer._id}
                          className="group transition-colors duration-300 hover:bg-white/[0.015]"
                        >
                          {/* Reference */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-foreground">
                            {transfer.header.name}
                          </TableCell>

                          {/* Customer */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                            {customerName}
                          </TableCell>

                          {/* Scheduled Date */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                            {new Date(transfer.header.scheduledDate).toLocaleDateString()}
                          </TableCell>

                          {/* Status State */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            <Badge
                              className={`
                                rounded-none
                                border-0
                                bg-transparent
                                px-0
                                font-mono
                                text-[12px]
                                uppercase
                                tracking-[0.12em]
                                hover:bg-transparent
                                shadow-none
                                ${statusColors[transfer.status] || "text-muted-foreground"}
                              `}
                            >
                              {statusLabels[transfer.status] || transfer.status}
                            </Badge>
                          </TableCell>

                          {/* Suggested Action Button */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            {nextAction && !isClosed ? (
                              <Button
                                size="sm"
                                onClick={() => handleContinue(transfer)}
                                className="h-8 rounded-none bg-primary text-primary-foreground text-[11px] font-mono uppercase tracking-wider hover:bg-primary/95 px-3 cursor-pointer inline-flex items-center gap-1.5"
                              >
                                {nextAction}
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            ) : (
                              <span className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                                None
                              </span>
                            )}
                          </TableCell>

                          {/* Action Items */}
                          <TableCell className="px-8 py-7 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAction(transfer, "view")}
                                className="h-8 w-8 rounded-none hover:bg-white/5 text-foreground cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-8 py-4 border-t border-border/40">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">
                    Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <span className="text-sm">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stock Transfer Popup Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) { fetchTransfers(); fetchAllTransfersForStats(); }
        }}
        title={formData?.header?.name || "New Delivery"}
        className="w-[80vw] max-w-[1400px]"
        footer={
          isViewOnly ? (
            <Button
              variant="outline"
              className="rounded-none cursor-pointer"
              onClick={() => setIsModalOpen(false)}
            >
              Close
            </Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-none cursor-pointer"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={saveTransfer}
                disabled={isSubmitting}
                className="rounded-none cursor-pointer"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </div>
          )
        }
      >
        {formData && (
          <StockTransferPopup
            formData={formData}
            setFormData={setFormData}
            isViewOnly={isViewOnly}
            operationType="outgoing"
            partners={partners}
            products={products}
            users={users}
            onAddPartner={() => setIsPartnerModalOpen(true)}
            onRefresh={fetchTransfers}
            currentUser={session?.user}
          />
        )}
      </ModularModal>

      {/* Partner Modal */}
      <ModularModal
        open={isPartnerModalOpen}
        onOpenChange={setIsPartnerModalOpen}
        title="Create Customer"
        className="max-w-4xl"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              className="rounded-none cursor-pointer"
              onClick={() => setIsPartnerModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePartner}
              className="rounded-none cursor-pointer"
            >
              Save Customer
            </Button>
          </div>
        }
      >
        <CustomerPopupContent
          formData={partnerFormData}
          setFormData={setPartnerFormData}
          activeTab={partnerTab}
          setActiveTab={setPartnerTab}
          isViewOnly={false}
          users={users}
        />
      </ModularModal>
    </DashboardLayout>
  );
}
