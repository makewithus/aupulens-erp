"use client";

import { useEffect, useState, useCallback } from "react";
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
import {
  Plus,
  MoreHorizontal,
  ChevronDown,
  Star,
  UserPlus,
  Upload,
  Check,
  Users2,
  RefreshCw,
  Columns,
} from "lucide-react";
import { ExportCustomersDialog } from "@/components/sales/customers/ExportCustomersDialog";
import { ExportCurrentViewDialog } from "@/components/sales/customers/ExportCurrentViewDialog";
import { AVAILABLE_CUSTOMER_COLUMNS } from "@/lib/sales/customerViews";

const SORT_FIELDS = [
  { key: "header.displayName", label: "Display Name" },
  { key: "createdAt", label: "Created Time" },
  { key: "openingBalance", label: "Receivables" },
];

export default function CustomersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [sortField, setSortField] = useState("createdAt");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportViewOpen, setExportViewOpen] = useState(false);

  const activeView = views.find((v) => v._id === activeViewId);
  const activeColumns: string[] =
    activeView?.columns?.length ? activeView.columns : AVAILABLE_CUSTOMER_COLUMNS.slice(0, 4).map((c) => c.key);

  const fetchViews = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/customer-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All Customers");
        if (allView) setActiveViewId((cur) => (cur === "all" ? allView._id : cur));
      }
    } catch {
      // Non-critical — the list still works without saved views.
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeViewId && activeViewId !== "all") params.set("viewId", activeViewId);
      params.set("sortField", sortField);
      const res = await fetch(`/api/sales/customers?${params.toString()}`);
      const json = await res.json();
      setCustomers(json.items || []);
    } catch (error) {
      console.error("Error loading customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [activeViewId, sortField]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = async (view: any) => {
    await fetch(`/api/sales/customer-views/${view._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !view.isFavorite }),
    });
    fetchViews();
  };

  const getPath = (obj: any, path: string) => path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  const columnLabel = (key: string) => AVAILABLE_CUSTOMER_COLUMNS.find((c) => c.key === key)?.label || key;

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Customers"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Customers" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-lg font-bold">
                {activeView?.name || "All Customers"} <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {views.map((v) => (
                <DropdownMenuItem
                  key={v._id}
                  className="flex items-center justify-between"
                  onClick={() => setActiveViewId(v._id)}
                >
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/sales/customers/views/new")}>
                <Plus className="w-4 h-4 mr-2" /> New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <Link href="/sales/customers/new">
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
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Sort by</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {SORT_FIELDS.map((f) => (
                      <DropdownMenuItem key={f.key} onClick={() => setSortField(f.key)}>
                        {f.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Import</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => router.push("/sales/customers/import")}>
                      Import Customers
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>Export Customers</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportViewOpen(true)}>Export Current View</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem disabled>Preferences</DropdownMenuItem>
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
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center py-16 px-4 text-center">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Users2 className="w-10 h-10 text-blue-600" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-7 w-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg font-bold">
                +
              </div>
            </div>
            <h2 className="text-xl font-bold mb-2">Every sale starts with a customer</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Create and manage your customers and their contact persons, all in one place.
            </p>
            <div className="flex items-center gap-3 mb-2">
              <Link href="/sales/customers/new">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <UserPlus className="w-4 h-4 mr-2" /> Create New Customer
                </Button>
              </Link>
              <Link href="/sales/customers/import">
                <Button variant="outline">
                  <Upload className="w-4 h-4 mr-2" /> Import File
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mb-10">or Import from another accounting tool</p>

            <div className="border rounded-none p-6 max-w-lg w-full text-left">
              <h3 className="font-semibold mb-4 flex items-center gap-2">Key Benefits</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {[
                  "Stay connected with multiple contact persons",
                  "Provide portal access to customers",
                  "Handle multiple addresses effortlessly",
                  "Create multi-currency transactions for contacts",
                ].map((benefit) => (
                  <div key={benefit} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {activeColumns.map((key) => (
                  <TableHead key={key}>{columnLabel(key)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c: any) => (
                <TableRow
                  key={c._id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(`/sales/customers/${c._id}`)}
                >
                  <TableCell className="font-medium">{c.header?.displayName || c.header?.name}</TableCell>
                  {activeColumns.map((key) => (
                    <TableCell key={key}>{String(getPath(c, key) ?? "—")}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ExportCustomersDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportCurrentViewDialog
        open={exportViewOpen}
        onOpenChange={setExportViewOpen}
        viewId={activeViewId}
        viewName={activeView?.name}
      />
    </DashboardLayout>
  );
}
