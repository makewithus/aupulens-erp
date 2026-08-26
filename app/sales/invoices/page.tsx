"use client";

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { SALES_PAGE_TITLE_CLASS } from "@/components/sales/styles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Settings, LayoutGrid, Plus, MoreHorizontal, Search, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function SalesInvoicesLandingPage() {
  const { data: session } = useSession();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await cachedFetch(`/api/sales/invoices?search=${search}&status=${statusFilter}`);
      const data = await res.json();
      if (data.success) {
        setInvoices(data.data);
      } else {
        toast.error(data.message || "Failed to fetch invoices");
      }
    } catch (e) {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [search, statusFilter]);

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <FileText className="w-12 h-12 mb-6 text-muted-foreground/30" />
      <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground mb-8">Creating invoices lightning fast.</h2>

      <div className="space-y-4 mb-10 text-left max-w-sm mx-auto">
        <div className="flex items-start gap-3">
          <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <p className="text-muted-foreground text-sm">Create invoices in 10 seconds &amp; share them with customers</p>
        </div>
        <div className="flex items-start gap-3">
          <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <p className="text-muted-foreground text-sm">Discover templates that are perfect for your business</p>
        </div>
        <div className="flex items-start gap-3">
          <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <p className="text-muted-foreground text-sm">Keep track of your day-to-day transactions</p>
        </div>
      </div>

      <Link href="/sales/invoices/new">
        <Button className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[13px] uppercase tracking-wider rounded-none cursor-pointer">
          <Plus className="h-4 w-4 mr-2" /> Create your first invoice
        </Button>
      </Link>

      <div className="flex items-center gap-6 mt-12 text-sm font-mono text-[11px] uppercase tracking-widest">
        <Button variant="link" className="text-muted-foreground">Talk to a specialist</Button>
        <span className="text-muted-foreground/40">•</span>
        <Button variant="link" className="text-muted-foreground">+91-9876543210 (WhatsApp)</Button>
        <span className="text-muted-foreground/40">•</span>
        <Button variant="link" className="text-primary">Watch how it works</Button>
      </div>
    </div>
  );

  const statusColors: Record<string, string> = {
    paid: "text-emerald-500",
    partially_paid: "text-amber-500",
    draft: "text-muted-foreground",
    saved: "text-blue-500",
    overdue: "text-red-500",
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Invoices"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Invoices" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className={SALES_PAGE_TITLE_CLASS}>
              Invoices
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/sales/document-settings">
              <Button
                variant="outline"
                className="h-11 rounded-none border-border/40 text-foreground font-mono text-[12px] uppercase tracking-wider"
              >
                <Settings className="w-4 h-4 mr-2" /> Document Settings
              </Button>
            </Link>
            <Button
              variant="outline"
              className="h-11 rounded-none border-border/40 text-foreground font-mono text-[12px] uppercase tracking-wider"
            >
              <LayoutGrid className="w-4 h-4 mr-2" /> POS Billing
            </Button>
            <Link href="/sales/invoices/new">
              <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
                <Plus className="w-4 h-4 mr-2" /> Create Invoice
              </Button>
            </Link>
          </div>
        </div>

        {!loading && invoices.length === 0 && !search && statusFilter === "all" ? (
          renderEmptyState()
        ) : (
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            <div className="border-b border-border/20 px-8 py-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="shrink-0">
                  <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                    All Invoices
                  </h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    {invoices.length} {invoices.length === 1 ? "Invoice" : "Invoices"}
                  </p>
                </div>

                <div className="w-full max-w-2xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35" />
                    <Input
                      placeholder="Search invoices..."
                      className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:ring-0 w-full text-foreground"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 w-full md:w-[190px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="saved">Saved</SelectItem>
                      <SelectItem value="partially_paid">Partially Paid</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Invoice Number</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Date</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Due Date</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Customer</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Status</TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Amount</TableHead>
                    <TableHead className="px-4 py-5 w-[64px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell className="px-8 py-7 text-right border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                        <TableCell className="px-4 py-7"><Skeleton className="h-8 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-24 text-center">
                        <FileText className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                        <h3 className="text-lg font-medium text-foreground">No invoices found</h3>
                        <p className="mt-2 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow key={inv._id} className="group transition-colors duration-300 hover:bg-white/[0.015]">
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">
                          <Link href={`/sales/invoices/${inv._id}`}>{inv.number}</Link>
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                          {new Date(inv.invoiceDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                          {new Date(inv.dueDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                          {inv.customerId?.header?.name || "Unknown"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[12px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[inv.status] || "text-muted-foreground"}`}>
                            {inv.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right border-r last:border-0 border-border/10 font-mono text-sm text-foreground">
                          ₹{inv.totalAmount?.toFixed(2)}
                        </TableCell>
                        <TableCell className="px-4 py-7">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none hover:bg-white/5 text-foreground cursor-pointer">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-none">
                              <DropdownMenuItem asChild>
                                <Link href={`/sales/invoices/${inv._id}`}>View Details</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/sales/invoices/${inv._id}/edit`}>Edit</Link>
                              </DropdownMenuItem>
                              {["saved", "overdue", "partially_paid"].includes(inv.status) && (
                                <DropdownMenuItem asChild>
                                  <Link href={`/sales/payments/new?customerId=${inv.customerId?._id || inv.customerId}&invoiceId=${inv._id}`}>
                                    Record Payment
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem asChild>
                                <a href={`/api/sales/invoices/${inv._id}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
