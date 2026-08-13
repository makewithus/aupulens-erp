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
  Repeat,
  User,
  RotateCw,
  FileText,
  CreditCard,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
} from "lucide-react";
import { ExportSubscriptionsDialog } from "@/components/sales/subscriptions/ExportSubscriptionsDialog";
import { ExportCurrentViewDialog } from "@/components/sales/subscriptions/ExportCurrentViewDialog";
import { AVAILABLE_SUBSCRIPTION_COLUMNS } from "@/lib/sales/subscriptionViews";

const SORT_FIELDS = [
  { key: "createdAt", label: "Created On" },
  { key: "activatedOn", label: "Activated On" },
  { key: "profileName", label: "Plan Name" },
  { key: "totalAmount", label: "Amount" },
  { key: "lastBilledOn", label: "Last Billed On" },
  { key: "nextBillingOn", label: "Next Billing On" },
  { key: "updatedAt", label: "Last Modified Time" },
];

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800";
    case "trial":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800";
    case "dunning":
    case "unpaid":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800";
    case "cancelled":
    case "expired":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:border-gray-700";
  }
}

function SubscriptionOverview() {
  const Node = ({
    icon: Icon,
    label,
    color = "border-gray-300",
  }: {
    icon: any;
    label: string;
    color?: string;
  }) => (
    <div className={`flex flex-col items-center gap-1.5 border rounded-none px-4 py-3 bg-background ${color}`}>
      <Icon className="w-5 h-5" />
      <span className="text-xs font-semibold text-center whitespace-nowrap">{label}</span>
    </div>
  );

  return (
    <div className="bg-muted/30 border rounded-none p-8">
      <h3 className="text-sm font-semibold text-center mb-8">Subscription Overview</h3>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Node icon={User} label="CUSTOMER" />
          <div className="flex flex-col items-center text-[10px] text-muted-foreground">
            <span>Approaches you for a subscription</span>
            <span>→</span>
          </div>
          <div className="border rounded-none p-3 bg-background">
            <p className="text-[10px] font-semibold text-center mb-2">PLANS OFFERED</p>
            <div className="flex gap-2">
              <div className="border rounded-none px-2 py-1 text-[10px]">Plan 1</div>
              <div className="border rounded-none px-2 py-1 text-[10px] flex items-center gap-1 border-green-400">
                Plan 2 <CheckCircle2 className="w-3 h-3 text-green-600" />
              </div>
              <div className="border rounded-none px-2 py-1 text-[10px]">Plan n</div>
            </div>
          </div>
          <div className="flex flex-col items-center text-[10px] text-muted-foreground">
            <span>Selects a plan</span>
            <span>→</span>
          </div>
          <Node icon={RotateCw} label="SUBSCRIPTION CREATED" />
          <span className="text-muted-foreground">→</span>
          <Node icon={FileText} label="INVOICE RAISED" color="border-purple-300 text-purple-700" />
        </div>

        <span className="text-muted-foreground">↓</span>
        <Node icon={CreditCard} label="PAYMENT MADE" color="border-green-300 text-green-700" />

        <div className="flex items-center gap-8 mt-2">
          <Node icon={CalendarX2} label="SUBSCRIPTION CANCELLED OR EXPIRED" color="border-red-300 text-red-700" />
          <div className="flex flex-col items-center text-[10px] text-muted-foreground">
            <span>←</span>
          </div>
          <Node icon={CalendarClock} label="END OF BILLING CYCLE" />
          <div className="flex flex-col items-center text-[10px] text-muted-foreground">
            <span>←</span>
            <span>Subscription stays active</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground border-t border-dashed pt-2 mt-2 w-full text-center">
          - - - Subscription renews (End of Billing Cycle loops back up to Invoice Raised) - - -
        </p>
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [viewSearch, setViewSearch] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportViewOpen, setExportViewOpen] = useState(false);

  const activeView = views.find((v) => v._id === activeViewId);
  const activeColumns: string[] =
    activeView?.columns?.length ? activeView.columns : AVAILABLE_SUBSCRIPTION_COLUMNS.slice(0, 4).map((c) => c.key);

  const fetchViews = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/sales/subscription-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All");
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
      params.set("sortDir", sortDir);
      const res = await cachedFetch(`/api/sales/subscriptions?${params.toString()}`);
      const json = await res.json();
      if (json.success) setSubscriptions(json.data || []);
    } catch (error) {
      console.error("Error loading subscriptions:", error);
      toast.error("Failed to load subscriptions");
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
    await cachedFetch(`/api/sales/subscription-views/${view._id}`, {
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
  const columnLabel = (key: string) => AVAILABLE_SUBSCRIPTION_COLUMNS.find((c) => c.key === key)?.label || key;
  const formatValue = (key: string, value: any) => {
    if (value == null) return "—";
    if (key === "totalAmount") return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    if (["createdAt", "activatedOn", "lastBilledOn", "nextBillingOn", "updatedAt"].includes(key)) {
      return new Date(value).toLocaleDateString("en-IN");
    }
    return String(value);
  };

  const filteredViews = views.filter((v) => v.name.toLowerCase().includes(viewSearch.toLowerCase()));

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Subscriptions"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Subscriptions" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-lg font-bold">
                {activeView?.name === "All" ? "All Subscriptions" : activeView?.name || "All Subscriptions"}{" "}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <div className="p-2">
                <Input
                  placeholder="Search views"
                  value={viewSearch}
                  onChange={(e) => setViewSearch(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {filteredViews.map((v) => (
                  <DropdownMenuItem
                    key={v._id}
                    className="flex items-center justify-between"
                    onClick={() => setActiveViewId(v._id)}
                  >
                    <span className="truncate pr-2">{v.name}</span>
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
              <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/views/new")}>
                <Plus className="w-4 h-4 mr-2" /> New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <Link href="/sales/subscriptions/new">
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
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/import")}>
                  Import Subscriptions
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>Export Subscriptions</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportViewOpen(true)}>Export Current View</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/settings/dunning")}>
                  Dunning Management
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/settings/email-notifications")}>
                  Email Notifications
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/settings/reminders")}>
                  Reminders
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/settings/webhooks")}>
                  Webhooks
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
        ) : subscriptions.length === 0 ? (
          <div className="space-y-10">
            <div className="flex flex-col items-center py-16 px-4 text-center">
              <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <Repeat className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">Create Your First Subscription</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Ready to streamline your billing? Get started by creating highly customizable subscriptions that
                cater to any billing model, and manage recurring payments from your customers effortlessly.
              </p>
              <Link href="/sales/subscriptions/new">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">CREATE A SUBSCRIPTION</Button>
              </Link>
            </div>
            <SubscriptionOverview />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer Name</TableHead>
                {activeColumns.map((key) => (
                  <TableHead key={key}>{columnLabel(key)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((s: any) => (
                <TableRow
                  key={s._id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(`/sales/subscriptions/${s._id}`)}
                >
                  <TableCell className="font-medium">{s.number || "—"}</TableCell>
                  <TableCell>{s.customerId?.header?.displayName || s.customerId?.header?.name || "—"}</TableCell>
                  {activeColumns.map((key) => (
                    <TableCell key={key}>
                      {key === "status" ? (
                        <span className={`text-xs px-2 py-1 rounded-none border capitalize ${statusColor(s.status)}`}>
                          {s.status}
                        </span>
                      ) : (
                        formatValue(key, getPath(s, key))
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ExportSubscriptionsDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportCurrentViewDialog
        open={exportViewOpen}
        onOpenChange={setExportViewOpen}
        viewId={activeViewId}
        viewName={activeView?.name}
      />
    </DashboardLayout>
  );
}
