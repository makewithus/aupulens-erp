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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Plus,
  MoreHorizontal,
  FileText,
  Mail,
  CheckCircle2,
  XCircle,
  FileCheck,
  RefreshCw,
} from "lucide-react";

function statusColor(status: string) {
  switch (status) {
    case "accepted":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800";
    case "rejected":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800";
    case "sent":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800";
    case "invoiced":
      return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:border-purple-800";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:border-gray-700";
  }
}

function LifecycleDiagram() {
  const Node = ({ icon: Icon, label, color }: { icon: any; label: string; color: string }) => (
    <div className={`flex items-center gap-2 border rounded-none px-4 py-2 ${color}`}>
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );

  return (
    <div className="border rounded-none p-8">
      <h3 className="text-sm font-semibold text-muted-foreground mb-6 text-center">Life cycle of a Quote</h3>
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <Node icon={FileText} label="QUOTE" color="border-gray-300" />
          <span className="text-muted-foreground">→</span>
          <Node icon={Mail} label="SENT TO CUSTOMER" color="border-blue-300 text-blue-700" />
        </div>
        <div className="flex items-center gap-16">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground">- - - - ↓</span>
            <Node icon={CheckCircle2} label="ACCEPT" color="border-green-300 text-green-700" />
            <span className="text-muted-foreground">↓</span>
            <Node icon={FileCheck} label="INVOICE" color="border-purple-300 text-purple-700" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground">- - - - ↓</span>
            <Node icon={XCircle} label="REJECT" color="border-red-300 text-red-700" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuotesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/quotes?status=all");
      const data = await res.json();
      if (data.success) setQuotes(data.data);
      else toast.error(data.message || "Failed to load quotes");
    } catch {
      toast.error("Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Quotes"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Quotes" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex items-center justify-between">
          <button className="flex items-center gap-1 text-lg font-bold">
            All Quotes <ChevronDown className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-4 h-4 mr-1" /> New <ChevronDown className="w-3.5 h-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push("/sales/quotes/new")}>Quote</DropdownMenuItem>
                <DropdownMenuItem disabled>Subscription Quote</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push("/sales/quotes/import")}>Import Quotes</DropdownMenuItem>
                <DropdownMenuItem onClick={load}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : quotes.length === 0 ? (
          <div className="space-y-10">
            <div className="flex flex-col items-center text-center py-10">
              <h2 className="text-xl font-bold mb-2">Seal the deal.</h2>
              <p className="text-sm text-muted-foreground mb-6">
                With quotes, give your customers an offer they can&apos;t refuse!
              </p>
              <Link href="/sales/quotes/new">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">CREATE NEW QUOTE</Button>
              </Link>
              <Link href="/sales/quotes/import" className="text-sm text-blue-600 underline mt-4">
                Import Quotes
              </Link>
            </div>
            <LifecycleDiagram />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Quote Date</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q: any) => (
                <TableRow
                  key={q._id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(`/sales/quotes/${q._id}`)}
                >
                  <TableCell className="font-medium">{q.quoteNumber}</TableCell>
                  <TableCell>{q.customerId?.header?.name || "—"}</TableCell>
                  <TableCell>{q.quoteDate ? new Date(q.quoteDate).toLocaleDateString("en-IN") : "—"}</TableCell>
                  <TableCell>{q.expiryDate ? new Date(q.expiryDate).toLocaleDateString("en-IN") : "—"}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-none border capitalize ${statusColor(q.status)}`}>
                      {q.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    ₹{Number(q.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </DashboardLayout>
  );
}
