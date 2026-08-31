"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STOCK_MOVE_STATUS,
  STOCK_MOVE_STATUS_VALUES,
  STOCK_MOVE_STATUS_LABELS,
  type StockMoveStatus,
} from "@/lib/constants/statuses";

// Extracted Subcomponents
import { StockMovesTable } from "@/components/inventory/stock-moves/StockMovesTable";
import { StockMovesModals } from "@/components/inventory/stock-moves/StockMovesModals";

// Default Form Data
const DEFAULT_FORM: any = {
  moveType: "internal",
  sourceLocation: { warehouseId: "", warehouseName: "", zone: "", bin: "" },
  destinationLocation: { warehouseId: "", warehouseName: "", zone: "", bin: "" },
  scheduledDate: new Date().toISOString().split("T")[0],
  lines: [],
  valuation: { method: "standard", totalValue: 0 },
  sourceDocument: "",
  responsibleId: "",
  notes: "",
};

export default function StockMovesPage() {
  return (
    <Suspense fallback={null}>
      <StockMovesPageInner />
    </Suspense>
  );
}

function StockMovesPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Data
  const [moves, setMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  // AI-native "redirect with filters" support — seeded from the URL
  // synchronously (lazy useState initializer) so the very first fetch
  // already uses them. A normal, param-less visit just gets the defaults
  // below, unchanged. `dateFrom`/`dateTo`/`amountMin`/`amountMax` aren't
  // filtered client-side (unlike `query`), so they're sent to the API
  // directly. This used to seed via a separate useEffect after mount,
  // which let an initial unfiltered fetch fire and render before the
  // filtered one landed: a visible flash of the wrong rows on every
  // filtered redirect.
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get("moveStatus") || "all");
  const [typeFilter, setTypeFilter] = useState<string>(() => searchParams.get("moveType") || "all");
  const [query, setQuery] = useState(() => searchParams.get("search") || "");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") || "");
  const [amountMin, setAmountMin] = useState(() => searchParams.get("amountMin") || "");
  const [amountMax, setAmountMax] = useState(() => searchParams.get("amountMax") || "");

  // Resources
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    pages: 1,
  });

  // Auth guard
  useEffect(() => {

    if (status === "authenticated") {
      fetchMoves();
      fetchResources();
    }
  }, [status, router]);

  // Fetch stock moves
  const fetchMoves = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("moveStatus", statusFilter);
      if (typeFilter !== "all") params.set("moveType", typeFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (amountMin) params.set("amountMin", amountMin);
      if (amountMax) params.set("amountMax", amountMax);

      const res = await cachedFetch(`/api/inventory/stock-moves?${params}`);
      const data = await res.json();
      setMoves(data.items || []);
    } catch (e) {
      toast.error("Failed to load stock moves");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, dateFrom, dateTo, amountMin, amountMax]);

  useEffect(() => {
    if (status === "authenticated") fetchMoves();
  }, [fetchMoves, status]);

  // Fetch warehouses & products
  const fetchResources = async () => {
    try {
      const [whRes, pRes] = await Promise.all([
        cachedFetch("/api/inventory/warehouse"),
        cachedFetch("/api/sales/products?limit=200"),
      ]);
      if (whRes.ok) {
        const d = await whRes.json();
        setWarehouses(d.warehouses || []);
      }
      if (pRes.ok) {
        const d = await pRes.json();
        setProducts(d.items || []);
      }
    } catch (e) {
      console.error("Failed to fetch resources", e);
    }
  };

  // Handlers
  const handleCreate = () => {
    setFormData(JSON.parse(JSON.stringify(DEFAULT_FORM)));
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  // AI-native pre-fill: open the Stock Move modal with AI-extracted details.
  useAiPrefill("stock_move", (p) => {
    const d: any = p.data || {};
    const base = JSON.parse(JSON.stringify(DEFAULT_FORM));
    setFormData({
      ...base,
      moveType: ["internal", "inbound", "outbound"].includes(d.move_type) ? d.move_type : base.moveType,
      scheduledDate: d.scheduled_date ? String(d.scheduled_date) : base.scheduledDate,
      sourceDocument: d.source_document ? String(d.source_document) : base.sourceDocument,
      notes: d.notes ? String(d.notes) : base.notes,
    });
    setIsViewOnly(false);
    setIsModalOpen(true);
    const hints: string[] = Array.isArray(p.suggestions) ? [...p.suggestions] : [];
    if (d.source_warehouse) hints.push(`Source warehouse: "${d.source_warehouse}".`);
    if (d.destination_warehouse) hints.push(`Destination warehouse: "${d.destination_warehouse}".`);
    if (Array.isArray(d.items) && d.items.length) hints.push(`Add ${d.items.length} product line(s): ${d.items.map((it: any) => it?.name).filter(Boolean).join(", ")}.`);
    if (hints.length) toast.info("Review before saving", { description: hints.join("  •  "), duration: 10000 });
  });

  const handleView = (m: any) => {
    setFormData(m);
    setIsViewOnly(true);
    setIsModalOpen(true);
  };

  const handleEdit = (m: any) => {
    setFormData(m);
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await cachedFetch(`/api/inventory/stock-moves/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      toast.success("Stock move deleted");
      fetchMoves();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteId(null);
    }
  };

  // Save / Create
  const saveMove = async () => {
    setIsSubmitting(true);
    try {
      const isEdit = !!formData._id;
      const url = isEdit
        ? `/api/inventory/stock-moves/${formData._id}`
        : "/api/inventory/stock-moves";
      const method = isEdit ? "PATCH" : "POST";

      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      toast.success(isEdit ? "Stock move updated" : "Stock move created");
      setIsModalOpen(false);
      fetchMoves();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Advance Status
  const advanceStatus = async (id: string, newStatus: StockMoveStatus) => {
    try {
      const body: any = { moveStatus: newStatus };

      // If advancing to accounting_created, include placeholder accounts
      if (newStatus === STOCK_MOVE_STATUS.ACCOUNTING_CREATED) {
        body.accounting = {
          debitAccount: "Inventory Asset",
          creditAccount: "Goods in Transit",
        };
      }

      const res = await cachedFetch(`/api/inventory/stock-moves/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transition failed");
      }
      toast.success(`Status updated to ${STOCK_MOVE_STATUS_LABELS[newStatus]}`);
      fetchMoves();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Line helpers
  const addLine = () => {
    setFormData((prev: any) => ({
      ...prev,
      lines: [
        ...prev.lines,
        { productId: "", productName: "", demand: 0, done: 0, uom: "Units", unitCost: 0, totalValue: 0 },
      ],
    }));
  };

  const updateLine = (index: number, field: string, value: any) => {
    setFormData((prev: any) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], [field]: value };

      // Auto-fill product name & cost
      if (field === "productId") {
        const product = products.find((p: any) => p._id === value);
        if (product) {
          lines[index].productName = product.header?.name || "";
          lines[index].unitCost =
            product.tab_general_information?.standard_price || 0;
        }
      }

      // Recalculate line value
      if (["demand", "unitCost"].includes(field)) {
        lines[index].totalValue =
          (lines[index].demand || 0) * (lines[index].unitCost || 0);
      }

      return { ...prev, lines };
    });
  };

  const removeLine = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      lines: prev.lines.filter((_: any, i: number) => i !== index),
    }));
  };

  // Update Location Helper
  const setLocation = (
    locKey: "sourceLocation" | "destinationLocation",
    field: string,
    value: string,
  ) => {
    setFormData((prev: any) => {
      const loc = { ...prev[locKey], [field]: value };
      // Auto-fill warehouse name
      if (field === "warehouseId") {
        const wh = warehouses.find((w: any) => w._id === value);
        loc.warehouseName = wh ? wh.name : "";
      }
      return { ...prev, [locKey]: loc };
    });
  };

  // Filtered list for search
  const filteredMoves = query
    ? moves.filter(
        (m) =>
          m.reference?.toLowerCase().includes(query.toLowerCase()) ||
          m.sourceLocation?.warehouseName
            ?.toLowerCase()
            .includes(query.toLowerCase()) ||
          m.destinationLocation?.warehouseName
            ?.toLowerCase()
            .includes(query.toLowerCase()),
      )
    : moves;

  // Pagination slice
  const total = filteredMoves.length;
  const pages = Math.ceil(total / pagination.limit) || 1;
  const paged = filteredMoves.slice(
    (pagination.page - 1) * pagination.limit,
    pagination.page * pagination.limit,
  );

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory"
      pageName="Stock Moves"
      breadcrumbs={[
        { label: "Inventory", href: "/inventory/summary" },
        { label: "Stock Moves" },
      ]}
      userName={session?.user?.name || "User"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={fetchMoves}
    >
      <div className="space-y-1">
        {/* Page Header Spacer */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2"></div>

        {/* Table & Filtering Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none flex flex-col min-h-[600px]">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Stock Moves</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {total} {total === 1 ? "Move" : "Moves"} Total
                </p>
              </div>

              <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={(val) => {
                      setQuery(val);
                      setPagination((p) => ({ ...p, page: 1 }));
                    }}
                    placeholder="Search reference or location..."
                  />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                    <SelectTrigger className="w-40 h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/40">
                      <SelectItem value="all">All Statuses</SelectItem>
                      {STOCK_MOVE_STATUS_VALUES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STOCK_MOVE_STATUS_LABELS[s as StockMoveStatus]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
                    <SelectTrigger className="w-36 h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/40">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="incoming">Incoming</SelectItem>
                      <SelectItem value="outgoing">Outgoing</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>

                  <DateRangeFilter
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFromChange={setDateFrom}
                    onDateToChange={setDateTo}
                  />
                </div>

                <Button
                  onClick={handleCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Move
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0 flex-1">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : paged.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No stock moves found
                </p>
              </div>
            ) : (
              <StockMovesTable
                paged={paged}
                advanceStatus={advanceStatus}
                handleView={handleView}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
              />
            )}
          </CardContent>

          {/* Pagination Footer */}
          <div className="border-t border-border/20 p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-mono text-muted-foreground/60">
              {total > 0
                ? `Showing ${(pagination.page - 1) * pagination.limit + 1} to ${Math.min(
                    pagination.page * pagination.limit,
                    total,
                  )} of ${total} entries`
                : "No entries"}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() => setPagination((p) => ({ ...p, page: 1 }))}
                disabled={pagination.page === 1}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page - 1 }))
                }
                disabled={pagination.page === 1}
              >
                Prev
              </Button>
              <div className="text-xs font-mono text-foreground px-3">
                {pagination.page} / {pages}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page + 1 }))
                }
                disabled={pagination.page >= pages}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() => setPagination((p) => ({ ...p, page: pages }))}
                disabled={pagination.page >= pages}
              >
                Last
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <StockMovesModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        isViewOnly={isViewOnly}
        setIsViewOnly={setIsViewOnly}
        isSubmitting={isSubmitting}
        formData={formData}
        setFormData={setFormData}
        warehouses={warehouses}
        products={products}
        saveMove={saveMove}
        addLine={addLine}
        updateLine={updateLine}
        removeLine={removeLine}
        setLocation={setLocation}
        fetchMoves={fetchMoves}
        deleteId={deleteId}
        setDeleteId={setDeleteId}
        confirmDelete={confirmDelete}
      />
    </DashboardLayout>
  );
}
