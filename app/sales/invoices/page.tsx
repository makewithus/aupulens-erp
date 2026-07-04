"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { Button } from "@/components/ui/button";
import { Check, Settings, LayoutGrid, Plus, MoreHorizontal, Search, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
      const res = await fetch(`/api/sales/invoices?search=${search}&status=${statusFilter}`);
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
      <div className="w-24 h-24 mb-6 relative">
        <div className="absolute inset-0 bg-blue-100 rounded-full dark:bg-blue-900/30"></div>
        <FileText className="w-12 h-12 absolute inset-0 m-auto text-blue-600" />
      </div>
      <h2 className="text-2xl font-bold mb-8">Creating invoices lightning fast.</h2>
      
      <div className="space-y-4 mb-10 text-left max-w-sm mx-auto">
        <div className="flex items-start">
          <div className="bg-green-100 text-green-600 rounded-full p-1 mr-3 mt-0.5">
            <Check className="w-4 h-4" />
          </div>
          <p className="text-muted-foreground text-sm">Create invoices in 10 seconds & share them with customers</p>
        </div>
        <div className="flex items-start">
          <div className="bg-green-100 text-green-600 rounded-full p-1 mr-3 mt-0.5">
            <Check className="w-4 h-4" />
          </div>
          <p className="text-muted-foreground text-sm">Discover templates that are perfect for your business</p>
        </div>
        <div className="flex items-start">
          <div className="bg-green-100 text-green-600 rounded-full p-1 mr-3 mt-0.5">
            <Check className="w-4 h-4" />
          </div>
          <p className="text-muted-foreground text-sm">Keep track of your day-to-day transactions</p>
        </div>
      </div>
      
      <Link href="/sales/invoices/new">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 rounded-md text-base shadow-lg transition-transform hover:-translate-y-1">
          <Plus className="w-5 h-5 mr-2" /> Create your first invoice
        </Button>
      </Link>
      
      <div className="flex items-center gap-6 mt-12 text-sm">
        <Button variant="link" className="text-muted-foreground">Talk to a specialist</Button>
        <span className="text-muted-foreground">•</span>
        <Button variant="link" className="text-muted-foreground">+91-9876543210 (WhatsApp)</Button>
        <span className="text-muted-foreground">•</span>
        <Button variant="link" className="text-blue-600">Watch how it works</Button>
      </div>
    </div>
  );

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'paid': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800';
      case 'partially_paid': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800';
      case 'draft': return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300';
      case 'overdue': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800';
      default: return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800';
    }
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Invoices
            <span className="bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded-md ml-2">{invoices.length > 0 ? invoices.length : 0}</span>
          </h1>
          
          <div className="flex items-center gap-3">
            <Link href="/sales/document-settings">
              <Button variant="outline" className="border-border text-foreground">
                <Settings className="w-4 h-4 mr-2" /> Document Settings
              </Button>
            </Link>
            <Button variant="outline" className="border-border text-foreground">
              <LayoutGrid className="w-4 h-4 mr-2" /> POS Billing
            </Button>
            <Link href="/sales/invoices/new">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                <Plus className="w-4 h-4 mr-2" /> Create Invoice
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : invoices.length === 0 && !search && statusFilter === "all" ? (
          renderEmptyState()
        ) : (
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center gap-4 bg-muted/20">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search invoices..." 
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
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
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold text-foreground">INVOICE NUMBER</TableHead>
                    <TableHead className="font-semibold text-foreground">DATE</TableHead>
                    <TableHead className="font-semibold text-foreground">DUE DATE</TableHead>
                    <TableHead className="font-semibold text-foreground">CUSTOMER</TableHead>
                    <TableHead className="font-semibold text-foreground">STATUS</TableHead>
                    <TableHead className="font-semibold text-foreground text-right">AMOUNT</TableHead>
                    <TableHead className="font-semibold text-foreground w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        No invoices found matching your criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow key={inv._id} className="hover:bg-muted/50 cursor-pointer">
                        <TableCell className="font-medium text-blue-600">
                          <Link href={`/sales/invoices/${inv._id}`}>{inv.number}</Link>
                        </TableCell>
                        <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(inv.dueDate).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium">{inv.customerId?.header?.name || "Unknown"}</TableCell>
                        <TableCell>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(inv.status)}`}>
                            {inv.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">₹ {inv.totalAmount?.toFixed(2)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/sales/invoices/${inv._id}`}>View Details</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/sales/invoices/${inv._id}/edit`}>Edit</Link>
                              </DropdownMenuItem>
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
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
