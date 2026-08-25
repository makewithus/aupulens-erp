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
  ShoppingCart,
  User,
  FileCheck2,
  ClipboardList,
  Boxes,
  Receipt,
  Banknote,
} from "lucide-react";
import { ExportSalesOrdersDialog } from "@/components/sales/salesOrders/ExportSalesOrdersDialog";
import { ExportCurrentViewDialog } from "@/components/sales/salesOrders/ExportCurrentViewDialog";
import { AVAILABLE_SALE_ORDER_COLUMNS } from "@/lib/sales/saleOrderViews";

const SORT_FIELDS = [
  { key: "createdAt", label: "Created Time" },
  { key: "updatedAt", label: "Last Modified Time" },
  { key: "header.dateOrder", label: "Date" },
  { key: "header.name", label: "Sales Order#" },
  { key: "otherInfo.clientOrderRef", label: "Reference#" },
  { key: "header.partnerId", label: "Customer Name" },
  { key: "totals.amountTotal", label: "Amount" },
  { key: "expectedShipmentDate", label: "Expected Shipment Date" },
];

function statusColor(status: string) {
  switch (status) {
    case "confirmed":
    case "approved":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800";
    case "pending_approval":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800";
    case "on_hold":
      return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800";
    case "void":
    case "closed":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800";
    default:
      return "bg-accent text-muted-foreground border-border dark:bg-accent dark:border-border";
  }
}

function LifecycleDiagram() {
  const Node = ({ icon: Icon, label, color = "border-border" }: { icon: any; label: string; color?: string }) => (
    <div className={`flex items-center gap-2 border rounded-none px-4 py-2.5 bg-background ${color}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
    </div>
  );

  return (
    <div className="bg-muted/30 border rounded-none p-8">
      <h3 className="text-sm font-semibold text-center mb-8">Life cycle of a Sales Order</h3>
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <div className="flex flex-col gap-2">
            <Node icon={User} label="CUSTOMER REQUEST" />
            <Node icon={FileCheck2} label="ACCEPTED ESTIMATE" />
          </div>
          <span className="text-muted-foreground text-xs">- - - →</span>
          <Node icon={ShoppingCart} label="CREATE SALES ORDER" color="border-blue-300 text-blue-700" />
          <span className="text-muted-foreground text-xs">- CONVERT TO OPEN - →</span>
          <Node icon={ClipboardList} label="CONFIRM SALES ORDER" color="border-purple-300 text-purple-700" />
          <span className="text-muted-foreground text-xs">- LOW STOCK - →</span>
          <Node icon={Boxes} label="CONVERT TO PURCHASE ORDER" />
        </div>
        <div className="flex items-center gap-6">
          <span className="text-muted-foreground text-xs">↓</span>
        </div>
        <div className="flex items-center gap-6">
          <Node icon={Receipt} label="CONVERT SALES ORDER TO INVOICE" color="border-indigo-300 text-indigo-700" />
          <span className="text-muted-foreground text-xs">← - RECEIVE GOODS - -</span>
        </div>
        <span className="text-muted-foreground text-xs">↓</span>
        <Node icon={Banknote} label="GET PAID" color="border-green-400 text-green-700" />
      </div>
    </div>
  );
}

export default function SalesOrdersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [viewSearch, setViewSearch] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportViewOpen, setExportViewOpen] = useState(false);

  const activeView = views.find((v) => v._id === activeViewId);
  const extraColumns: string[] = activeView?.columns?.length ? activeView.columns : [];

  const fetchViews = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/sales/sales-order-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All");
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
      const res = await cachedFetch(`/api/sales/sales-orders?${params.toString()}`);
      const json = await res.json();
      if (json.success) setOrders(json.data || []);
    } catch (error) {
      console.error("Error loading sales orders:", error);
      toast.error("Failed to load sales orders");
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
    await cachedFetch(`/api/sales/sales-order-views/${view._id}`, {
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
  const columnLabel = (key: string) => AVAILABLE_SALE_ORDER_COLUMNS.find((c) => c.key === key)?.label || key;
  const filteredViews = views.filter((v) => v.name.toLowerCase().includes(viewSearch.toLowerCase()));

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Sales Orders"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Sales Orders" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-lg font-bold">
                {activeView?.name === "All" ? "All Sales Orders" : activeView?.name || "All Sales Orders"}{" "}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <div className="p-2">
                <Input placeholder="Search views" value={viewSearch} onChange={(e) => setViewSearch(e.target.value)} className="h-8" />
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-72 overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {filteredViews.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">No views found.</div>
                ) : (
                  filteredViews.map((v) => (
                    <DropdownMenuItem
                      key={v._id}
                      className="flex items-center justify-between gap-2"
                      onClick={() => setActiveViewId(v._id)}
                    >
                      <span className={`truncate ${v._id === activeViewId ? "font-semibold text-foreground" : ""}`}>{v.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(v);
                        }}
                        className="shrink-0 p-1 hover:bg-muted"
                        aria-label={v.isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star className={`w-3.5 h-3.5 ${v.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                      </button>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/sales/sales-orders/views/new")}>
                <Plus className="w-4 h-4 mr-2" /> New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <Link href="/sales/sales-orders/new">
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
                <DropdownMenuItem onClick={() => router.push("/sales/sales-orders/import")}>
                  Import Sales Orders
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>Export Sales Orders</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportViewOpen(true)}>Export Current View</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
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
        ) : orders.length === 0 ? (
          <div className="space-y-10">
            <div className="flex flex-col items-center py-16 px-4 text-center">
              <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <ShoppingCart className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">Start Managing Your Sales Activities!</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Create, customize and send professional Sales Orders.
              </p>
              <Link href="/sales/sales-orders/new">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">CREATE SALES ORDER</Button>
              </Link>
              <div className="border-t w-full max-w-sm mt-8 pt-4 text-xs text-muted-foreground">
                Convert vendor purchase orders into sales orders via <strong>Bharat Connect</strong>.{" "}
                <Link href="/sales/document-settings" className="text-blue-600 underline">
                  Setup Now
                </Link>
              </div>
            </div>
            <LifecycleDiagram />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Sales Order#</TableHead>
                <TableHead>Customer Name</TableHead>
                <TableHead>Order Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {extraColumns.map((key) => (
                  <TableHead key={key}>{columnLabel(key)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o: any) => (
                <TableRow
                  key={o._id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(`/sales/sales-orders/${o._id}`)}
                >
                  <TableCell>{o.header?.dateOrder ? new Date(o.header.dateOrder).toLocaleDateString("en-IN") : "—"}</TableCell>
                  <TableCell className="font-medium">{o.header?.name}</TableCell>
                  <TableCell>{o.header?.partnerId?.header?.displayName || o.header?.partnerId?.header?.name || "—"}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-none border capitalize ${statusColor(o.salesOrderStatus)}`}>
                      {o.salesOrderStatus?.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    ₹{Number(o.totals?.amountTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  {extraColumns.map((key) => (
                    <TableCell key={key}>{String(getPath(o, key) ?? "—")}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ExportSalesOrdersDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportCurrentViewDialog
        open={exportViewOpen}
        onOpenChange={setExportViewOpen}
        viewId={activeViewId}
        viewName={activeView?.name}
      />
    </DashboardLayout>
  );
}
