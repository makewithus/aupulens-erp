"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeftRight,
  ArrowRight,
  X,
  CheckCircle,
  MapPin,
  Truck,
  BarChart3,
  BookOpen,
  FileText,
  XCircle,
  Package,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import {
  STOCK_MOVE_STATUS,
  STOCK_MOVE_STATUS_VALUES,
  STOCK_MOVE_STATUS_LABELS,
  STOCK_MOVE_STATUS_COLORS,
  STOCK_MOVE_FLOW_STEPS,
  getNextStockMoveStatuses,
  type StockMoveStatus,
} from "@/lib/constants/statuses";

// ── Step icons for the flow stepper ──
const STEP_ICONS: Record<string, any> = {
  requested: FileText,
  source_validated: MapPin,
  destination_assigned: MapPin,
  move_executed: Truck,
  valuation_updated: BarChart3,
  accounting_created: BookOpen,
};

// ── Flow Stepper Component ──
function StockMoveFlowStepper({ current }: { current: StockMoveStatus }) {
  const currentIdx = STOCK_MOVE_FLOW_STEPS.indexOf(current);
  const isCancelled = current === STOCK_MOVE_STATUS.CANCELLED;

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {STOCK_MOVE_FLOW_STEPS.map((step, idx) => {
        const Icon = STEP_ICONS[step] || FileText;
        const label = STOCK_MOVE_STATUS_LABELS[step];
        const isDone = !isCancelled && currentIdx > idx;
        const isActive = step === current;

        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap ${
                isActive
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                  : isDone
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 ${isDone ? "text-green-500" : ""}`}
              />
              {label}
            </div>
            {idx < STOCK_MOVE_FLOW_STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />
            )}
          </div>
        );
      })}
      {isCancelled && (
        <div className="flex items-center">
          <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />
          <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold">
            <XCircle className="h-3.5 w-3.5" /> Cancelled
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status Badge Component ──
function StatusBadge({ status }: { status: StockMoveStatus }) {
  const colors = STOCK_MOVE_STATUS_COLORS[status] || {
    bg: "bg-gray-100",
    text: "text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      {STOCK_MOVE_STATUS_LABELS[status] || status}
    </span>
  );
}

// ── Move Type Badge ──
function MoveTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    internal: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    incoming: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    outgoing: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    adjustment: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[type] || "bg-gray-100 text-gray-600"}`}
    >
      {type}
    </span>
  );
}

// ── Default Form Data ──
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
  const { data: session, status } = useSession();
  const router = useRouter();

  // ── Data ──
  const [moves, setMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ──
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  // ── Resources ──
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // ── Modal ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Pagination ──
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    pages: 1,
  });

  // ── Auth guard ──
  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/inventory");
    if (status === "authenticated") {
      fetchMoves();
      fetchResources();
    }
  }, [status]);

  // ── Fetch stock moves ──
  const fetchMoves = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("moveStatus", statusFilter);
      if (typeFilter !== "all") params.set("moveType", typeFilter);

      const res = await fetch(`/api/inventory/stock-moves?${params}`);
      const data = await res.json();
      setMoves(data.items || []);
    } catch (e) {
      toast.error("Failed to load stock moves");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (status === "authenticated") fetchMoves();
  }, [fetchMoves, status]);

  // ── Fetch warehouses & products ──
  const fetchResources = async () => {
    try {
      const [whRes, pRes] = await Promise.all([
        fetch("/api/inventory/warehouse"),
        fetch("/api/sales/products?limit=200"),
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

  // ── Handlers ──
  const handleCreate = () => {
    setFormData(JSON.parse(JSON.stringify(DEFAULT_FORM)));
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

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
      const res = await fetch(`/api/inventory/stock-moves/${deleteId}`, {
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

  // ── Save / Create ──
  const saveMove = async () => {
    setIsSubmitting(true);
    try {
      const isEdit = !!formData._id;
      const url = isEdit
        ? `/api/inventory/stock-moves/${formData._id}`
        : "/api/inventory/stock-moves";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
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

  // ── Advance Status ──
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

      const res = await fetch(`/api/inventory/stock-moves/${id}`, {
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

  // ── Line helpers ──
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

  // ── Warehouse name helper ──
  const warehouseName = (id: string) => {
    const wh = warehouses.find((w: any) => w._id === id);
    return wh ? `${wh.name} (${wh.warehouseCode})` : id;
  };

  // ── Update Location Helper ──
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

  // ── Filtered list for search ──
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

  // ── Pagination slice ──
  const total = filteredMoves.length;
  const pages = Math.ceil(total / pagination.limit) || 1;
  const paged = filteredMoves.slice(
    (pagination.page - 1) * pagination.limit,
    pagination.page * pagination.limit,
  );

  // ── Next action button label ──
  const nextActionLabel = (status: StockMoveStatus): { label: string; icon: any } | null => {
    const map: Record<string, { label: string; icon: any }> = {
      requested: { label: "Validate Source", icon: MapPin },
      source_validated: { label: "Assign Dest.", icon: MapPin },
      destination_assigned: { label: "Execute Move", icon: Truck },
      move_executed: { label: "Update Valuation", icon: BarChart3 },
      valuation_updated: { label: "Create Accounting", icon: BookOpen },
    };
    return map[status] || null;
  };

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
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="h-6 w-6" /> Stock Moves
            </h1>
            <p className="text-sm text-muted-foreground">
              Inventory Move Engine — request, validate, execute, value &amp; account
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reference / warehouse..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="pl-9 w-60 bg-background"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STOCK_MOVE_STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STOCK_MOVE_STATUS_LABELS[s as StockMoveStatus]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="incoming">Incoming</SelectItem>
                <SelectItem value="outgoing">Outgoing</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Move
            </Button>
          </div>
        </div>

        {/* ── Table ── */}
        <Card className="border-none shadow-sm bg-background/50 backdrop-blur-sm flex flex-col min-h-[600px]">
          <CardContent className="p-0 flex-1">
            {loading ? (
              <TableSkeleton rows={8} columns={7} />
            ) : paged.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ArrowLeftRight className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground font-medium">
                  No stock moves found
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a new stock move to get started
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 text-left">Reference</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Source</th>
                      <th className="px-4 py-3 text-left">Destination</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Valuation</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {paged.map((m) => {
                      const next = getNextStockMoveStatuses(m.moveStatus);
                      const happyNext = next.find(
                        (s) => s !== STOCK_MOVE_STATUS.CANCELLED,
                      );
                      const action = nextActionLabel(m.moveStatus);

                      return (
                        <tr
                          key={m._id}
                          className="hover:bg-muted/30 transition-colors group"
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-bold text-sm">{m.reference}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {new Date(m.scheduledDate).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <MoveTypeBadge type={m.moveType} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {m.sourceLocation?.warehouseName || "—"}
                            {m.sourceLocation?.zone && (
                              <span className="text-muted-foreground text-xs ml-1">
                                / {m.sourceLocation.zone}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {m.destinationLocation?.warehouseName || "—"}
                            {m.destinationLocation?.zone && (
                              <span className="text-muted-foreground text-xs ml-1">
                                / {m.destinationLocation.zone}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={m.moveStatus} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-sm">
                            ₹{(m.valuation?.totalValue || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* ── Next status action ── */}
                              {happyNext && action && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    advanceStatus(m._id, happyNext as StockMoveStatus)
                                  }
                                >
                                  <action.icon className="h-3 w-3 mr-1" />
                                  {action.label}
                                </Button>
                              )}

                              {/* ── Cancel (only if allowed) ── */}
                              {next.includes(STOCK_MOVE_STATUS.CANCELLED as StockMoveStatus) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-red-600 hover:bg-red-100"
                                  onClick={() =>
                                    advanceStatus(
                                      m._id,
                                      STOCK_MOVE_STATUS.CANCELLED as StockMoveStatus,
                                    )
                                  }
                                >
                                  <XCircle className="h-3 w-3 mr-1" /> Cancel
                                </Button>
                              )}

                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => handleView(m)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {m.moveStatus === STOCK_MOVE_STATUS.REQUESTED && (
                                <>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => handleEdit(m)}
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-600 hover:bg-red-100"
                                    onClick={() => handleDelete(m._id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>

          {/* ── Pagination ── */}
          <div className="border-t p-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {total > 0
                ? `Showing ${(pagination.page - 1) * pagination.limit + 1}–${Math.min(
                    pagination.page * pagination.limit,
                    total,
                  )} of ${total}`
                : "No entries"}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPagination((p) => ({ ...p, page: 1 }))}
                disabled={pagination.page === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page - 1 }))
                }
                disabled={pagination.page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-xs font-medium w-16 text-center">
                Page {pagination.page}/{pages}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page + 1 }))
                }
                disabled={pagination.page >= pages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: pages }))
                }
                disabled={pagination.page >= pages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* ── Create / Edit / View Modal ──────── */}
      {/* ═══════════════════════════════════════ */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) fetchMoves();
        }}
        title={
          formData?._id
            ? isViewOnly
              ? `${formData.reference}`
              : `Edit ${formData.reference}`
            : "New Stock Move"
        }
        className="w-[85vw] max-w-[1100px]"
        footer={
          <>
            {/* ── Flow stepper (viewOnly) ── */}
            {isViewOnly && formData?.moveStatus && (
              <div className="px-6 py-3 border-t">
                <StockMoveFlowStepper current={formData.moveStatus} />
              </div>
            )}
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              {isViewOnly ? (
                <>
                  <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                    Close
                  </Button>
                  {formData?.moveStatus === STOCK_MOVE_STATUS.REQUESTED && (
                    <Button onClick={() => setIsViewOnly(false)} className="bg-blue-600">
                      Edit
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveMove} disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : formData?._id ? "Update" : "Create Move"}
                  </Button>
                </>
              )}
            </div>
          </>
        }
      >
        {formData && (
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* ── Row 1: type + date + source doc ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Move Type</Label>
                {isViewOnly ? (
                  <div className="py-2">
                    <MoveTypeBadge type={formData.moveType} />
                  </div>
                ) : (
                  <Select
                    value={formData.moveType}
                    onValueChange={(v) => setFormData({ ...formData, moveType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal Transfer</SelectItem>
                      <SelectItem value="incoming">Incoming (Receipt)</SelectItem>
                      <SelectItem value="outgoing">Outgoing (Dispatch)</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                {isViewOnly ? (
                  <p className="text-sm py-2">
                    {new Date(formData.scheduledDate).toLocaleDateString()}
                  </p>
                ) : (
                  <Input
                    type="date"
                    value={
                      formData.scheduledDate
                        ? new Date(formData.scheduledDate).toISOString().split("T")[0]
                        : ""
                    }
                    onChange={(e) =>
                      setFormData({ ...formData, scheduledDate: e.target.value })
                    }
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Source Document</Label>
                {isViewOnly ? (
                  <p className="text-sm py-2">{formData.sourceDocument || "—"}</p>
                ) : (
                  <Input
                    placeholder="e.g. PO-2026-001"
                    value={formData.sourceDocument || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, sourceDocument: e.target.value })
                    }
                  />
                )}
              </div>
            </div>

            {/* ── Row 2: Source & Destination ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Source Location */}
              <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-orange-500" /> Source Location
                </h3>
                <div className="space-y-2">
                  <Label className="text-xs">Warehouse</Label>
                  {isViewOnly ? (
                    <p className="text-sm">
                      {formData.sourceLocation?.warehouseName || "—"}
                    </p>
                  ) : (
                    <Select
                      value={formData.sourceLocation?.warehouseId || ""}
                      onValueChange={(v) => setLocation("sourceLocation", "warehouseId", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((wh: any) => (
                          <SelectItem key={wh._id} value={wh._id}>
                            {wh.name} ({wh.warehouseCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Zone</Label>
                    {isViewOnly ? (
                      <p className="text-sm">{formData.sourceLocation?.zone || "—"}</p>
                    ) : (
                      <Input
                        placeholder="e.g. A"
                        value={formData.sourceLocation?.zone || ""}
                        onChange={(e) =>
                          setLocation("sourceLocation", "zone", e.target.value)
                        }
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bin</Label>
                    {isViewOnly ? (
                      <p className="text-sm">{formData.sourceLocation?.bin || "—"}</p>
                    ) : (
                      <Input
                        placeholder="e.g. A-01-02"
                        value={formData.sourceLocation?.bin || ""}
                        onChange={(e) =>
                          setLocation("sourceLocation", "bin", e.target.value)
                        }
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Destination Location */}
              <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-500" /> Destination Location
                </h3>
                <div className="space-y-2">
                  <Label className="text-xs">Warehouse</Label>
                  {isViewOnly ? (
                    <p className="text-sm">
                      {formData.destinationLocation?.warehouseName || "—"}
                    </p>
                  ) : (
                    <Select
                      value={formData.destinationLocation?.warehouseId || ""}
                      onValueChange={(v) =>
                        setLocation("destinationLocation", "warehouseId", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((wh: any) => (
                          <SelectItem key={wh._id} value={wh._id}>
                            {wh.name} ({wh.warehouseCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Zone</Label>
                    {isViewOnly ? (
                      <p className="text-sm">
                        {formData.destinationLocation?.zone || "—"}
                      </p>
                    ) : (
                      <Input
                        placeholder="e.g. B"
                        value={formData.destinationLocation?.zone || ""}
                        onChange={(e) =>
                          setLocation("destinationLocation", "zone", e.target.value)
                        }
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bin</Label>
                    {isViewOnly ? (
                      <p className="text-sm">
                        {formData.destinationLocation?.bin || "—"}
                      </p>
                    ) : (
                      <Input
                        placeholder="e.g. B-03-01"
                        value={formData.destinationLocation?.bin || ""}
                        onChange={(e) =>
                          setLocation("destinationLocation", "bin", e.target.value)
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Row 3: Valuation method + notes ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Valuation Method</Label>
                {isViewOnly ? (
                  <p className="text-sm py-2 capitalize">
                    {formData.valuation?.method || "standard"}
                  </p>
                ) : (
                  <Select
                    value={formData.valuation?.method || "standard"}
                    onValueChange={(v) =>
                      setFormData({
                        ...formData,
                        valuation: { ...formData.valuation, method: v },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard Cost</SelectItem>
                      <SelectItem value="average">Weighted Average</SelectItem>
                      <SelectItem value="fifo">FIFO</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                {isViewOnly ? (
                  <p className="text-sm py-2">{formData.notes || "—"}</p>
                ) : (
                  <Textarea
                    placeholder="Internal notes..."
                    value={formData.notes || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={2}
                  />
                )}
              </div>
            </div>

            {/* ── Move Lines ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Move Lines ({formData.lines?.length || 0})
                </h3>
                {!isViewOnly && (
                  <Button size="sm" variant="outline" onClick={addLine}>
                    <Plus className="h-3 w-3 mr-1" /> Add Line
                  </Button>
                )}
              </div>

              {formData.lines && formData.lines.length > 0 ? (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-right w-24">Demand</th>
                        <th className="px-3 py-2 text-right w-24">Done</th>
                        <th className="px-3 py-2 text-left w-20">UoM</th>
                        <th className="px-3 py-2 text-right w-28">Unit Cost</th>
                        <th className="px-3 py-2 text-right w-28">Total</th>
                        {!isViewOnly && <th className="px-3 py-2 w-10" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {formData.lines.map((line: any, idx: number) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-3 py-2">
                            {isViewOnly ? (
                              <span>{line.productName || "—"}</span>
                            ) : (
                              <Select
                                value={line.productId?._id || line.productId || ""}
                                onValueChange={(v) => updateLine(idx, "productId", v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((p: any) => (
                                    <SelectItem key={p._id} value={p._id}>
                                      {p.header?.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isViewOnly ? (
                              line.demand
                            ) : (
                              <Input
                                type="number"
                                className="h-8 w-20 text-right text-xs"
                                value={line.demand}
                                onChange={(e) =>
                                  updateLine(idx, "demand", parseFloat(e.target.value) || 0)
                                }
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isViewOnly ? (
                              <span
                                className={
                                  line.done >= line.demand
                                    ? "text-green-600 font-medium"
                                    : "text-amber-600"
                                }
                              >
                                {line.done}
                              </span>
                            ) : (
                              <Input
                                type="number"
                                className="h-8 w-20 text-right text-xs"
                                value={line.done}
                                onChange={(e) =>
                                  updateLine(idx, "done", parseFloat(e.target.value) || 0)
                                }
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {isViewOnly ? (
                              line.uom
                            ) : (
                              <Input
                                className="h-8 w-16 text-xs"
                                value={line.uom || "Units"}
                                onChange={(e) =>
                                  updateLine(idx, "uom", e.target.value)
                                }
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isViewOnly ? (
                              `₹${(line.unitCost || 0).toLocaleString()}`
                            ) : (
                              <Input
                                type="number"
                                className="h-8 w-24 text-right text-xs"
                                value={line.unitCost}
                                onChange={(e) =>
                                  updateLine(
                                    idx,
                                    "unitCost",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            ₹{((line.demand || 0) * (line.unitCost || 0)).toLocaleString()}
                          </td>
                          {!isViewOnly && (
                            <td className="px-3 py-2 text-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-500"
                                onClick={() => removeLine(idx)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No lines added yet.{" "}
                  {!isViewOnly && (
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={addLine}
                    >
                      Add one
                    </button>
                  )}
                </div>
              )}

              {/* ── Valuation summary ── */}
              {formData.lines && formData.lines.length > 0 && (
                <div className="flex justify-end">
                  <div className="bg-muted/50 rounded-lg px-4 py-2 text-sm">
                    <span className="text-muted-foreground mr-2">Total Valuation:</span>
                    <span className="font-bold text-lg">
                      ₹
                      {formData.lines
                        .reduce(
                          (s: number, l: any) =>
                            s + (l.demand || 0) * (l.unitCost || 0),
                          0,
                        )
                        .toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── View-only extra info ── */}
            {isViewOnly && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                {formData.effectiveDate && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Effective Date</Label>
                    <p className="text-sm font-medium">
                      {new Date(formData.effectiveDate).toLocaleString()}
                    </p>
                  </div>
                )}
                {formData.valuation?.updatedAt && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Valuation Updated</Label>
                    <p className="text-sm font-medium">
                      {new Date(formData.valuation.updatedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {formData.accounting?.createdAt && (
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Accounting Entry
                    </Label>
                    <p className="text-sm font-medium">
                      {formData.accounting.debitAccount} → {formData.accounting.creditAccount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(formData.accounting.createdAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Chatter (view only) ── */}
            {isViewOnly && formData.chatter && formData.chatter.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <h3 className="text-sm font-semibold">Activity Log</h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {formData.chatter
                    .slice()
                    .reverse()
                    .map((msg: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs py-1 px-2 rounded bg-muted/30"
                      >
                        <div className="flex-1">
                          <span className="font-medium">{msg.body}</span>
                        </div>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ModularModal>

      {/* ── Delete Confirmation ── */}
      <ModularModal
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Confirm Deletion"
        className="max-w-sm"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this stock move? This action cannot
            be undone.
          </p>
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
