'use client';

import { useEffect, useState, useCallback } from 'react';
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { financeSidebarConfig } from '@/config/sidebar/finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, CreditCard, BarChart3, DollarSign, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { StatsRowSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { DraggableVisualization } from '@/components/finance/DraggableVisualization';

interface Invoice {
  _id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  total: number;
  currency: string;
  status: string;
  issueDate: string;
  dueDate: string;
}

export default function ReceivablesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Visualization state
  const [isVizOpen, setIsVizOpen] = useState(false);
  const [vizData, setVizData] = useState<Record<string, string | number>[]>([]);

  useEffect(() => {
    if (status === "authenticated") {
      if (session?.user?.role !== 'finance' && session?.user?.role !== 'admin') {
        router.push('/auth/finance');
      }
    }
  }, [status, router, session]);

  // Reads from the canonical customer-invoice store (SalesInvoice, via
  // /api/sales/invoices) — the same one /sales/invoices itself uses. This
  // page used to read from the deprecated models/Invoice.ts collection
  // via /api/finance/invoices, which no longer receives new invoices now
  // that /finance/invoices redirects to /sales/invoices.
  const fetchInvoices = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);

      const res = await cachedFetch(`/api/sales/invoices?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch invoices');

      const data = await res.json();
      const mapped: Invoice[] = (data.data || []).map((inv: any) => ({
        _id: inv._id,
        invoiceNumber: inv.number,
        customerId: inv.customerId?._id || inv.customerId,
        customerName: inv.customerId?.header?.displayName || inv.customerId?.header?.name || 'Unknown',
        customerEmail: inv.customerId?.contact_details?.email || '',
        total: inv.totalAmount || 0,
        currency: 'INR',
        status: inv.status,
        issueDate: inv.invoiceDate,
        dueDate: inv.dueDate,
      }));
      setInvoices(mapped);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError('Failed to load invoices');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchInvoices();
    }
  }, [status, fetchInvoices]);

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const config = {
      draft: { className: 'bg-muted text-muted-foreground border-border', label: 'Draft' },
      saved: { className: 'bg-blue-800/10 text-blue-800 dark:text-blue-400 border-blue-800/20', label: 'Saved' },
      partially_paid: { className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', label: 'Partially Paid' },
      paid: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Paid' },
      overdue: { className: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Overdue' },
      cancelled: { className: 'bg-muted text-muted-foreground border-border', label: 'Cancelled' },
    };

    const style = config[status as keyof typeof config] || config.draft;
    
    return (
      <Badge className={`${style.className} border font-medium`} variant="outline">
        {style.label}
      </Badge>
    );
  };

  const getDaysOverdue = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance Dashboard"
        pageName="Accounts Receivable"
        breadcrumbs={[
          { label: 'Dashboard', href: '/finance/summary' },
          { label: 'Receivables' }
        ]}
        profilePath="/finance/profile"
        userName={session?.user?.name || 'User'}
        userEmail={session?.user?.email || ''}
        userRole={session?.user?.role || 'finance'}
        onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      >
        <div className="space-y-6">
          <div><div className="h-9 w-80 bg-muted animate-pulse rounded mb-2" /><div className="h-5 w-96 bg-muted animate-pulse rounded" /></div>
          <StatsRowSkeleton count={4} />
          <Card><CardContent className="pt-6"><TableSkeleton rows={8} columns={7} /></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  const filteredInvoices = statusFilter === 'all' 
    ? invoices 
    : invoices.filter(inv => inv.status === statusFilter);

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance Dashboard"
      pageName="Accounts Receivable"
      breadcrumbs={[
        { label: 'Dashboard', href: '/finance/summary' },
        { label: 'Receivables' }
      ]}
      profilePath="/finance/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      onRefresh={fetchInvoices}
    >
      <div className="space-y-6">
        <FinancePageHeader
          title="Accounts Receivable"
          description="Track customer invoices and manage payments"
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const paidTotal = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total, 0);
                  const unpaidTotal = invoices.filter(inv => inv.status === 'saved' || inv.status === 'partially_paid' || inv.status === 'draft').reduce((sum, inv) => sum + inv.total, 0);
                  const overdueTotal = invoices.filter(inv => inv.status === 'overdue').reduce((sum, inv) => sum + inv.total, 0);
                  
                  setVizData([
                    { category: 'Paid', amount: paidTotal, count: invoices.filter(inv => inv.status === 'paid').length },
                    { category: 'Unpaid', amount: unpaidTotal, count: invoices.filter(inv => inv.status === 'saved' || inv.status === 'partially_paid' || inv.status === 'draft').length },
                    { category: 'Overdue', amount: overdueTotal, count: invoices.filter(inv => inv.status === 'overdue').length },
                  ]);
                  setIsVizOpen(true);
                }}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Visualize
              </Button>
              <Button asChild>
                <Link href="/sales/invoices/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Invoice
                </Link>
              </Button>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Receivable</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{invoices.reduce((sum, inv) => sum + inv.total, 0).toLocaleString('en-IN')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{invoices.filter(inv => inv.status === 'saved' || inv.status === 'partially_paid').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Paid</CardTitle>
              <CheckCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{invoices.filter(inv => inv.status === 'paid').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{invoices.filter(inv => inv.status === 'overdue').length}</div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        {/* Invoices Table */}
        <Card className="border-border/40">
          <CardHeader className="bg-muted/30">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold">
                Invoices
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredInvoices.length} total)
                </span>
              </CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="saved">Saved</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Invoice #</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Issue Date</TableHead>
                    <TableHead className="font-semibold">Due Date</TableHead>
                    <TableHead className="text-right font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        No invoices found. Create your first invoice to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvoices.map((invoice) => (
                      <TableRow key={invoice._id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-semibold text-sm">{invoice.invoiceNumber}</TableCell>
                        <TableCell>
                          <div className="font-medium">{invoice.customerName}</div>
                          <div className="text-xs text-muted-foreground">{invoice.customerEmail}</div>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(invoice.issueDate)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDate(invoice.dueDate)}</div>
                          {invoice.status === 'overdue' && (
                            <div className="text-xs text-destructive font-medium mt-0.5">
                              {getDaysOverdue(invoice.dueDate)} days overdue
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(invoice.total)}
                        </TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {(invoice.status === 'saved' || invoice.status === 'partially_paid' || invoice.status === 'overdue') && (
                              <Button size="sm" variant="outline" className="h-8" asChild>
                                <Link href={`/sales/payments/new?invoiceId=${invoice._id}&customerId=${invoice.customerId}`}>
                                  <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                                  Record Payment
                                </Link>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Draggable Visualization */}
        <DraggableVisualization
          isOpen={isVizOpen}
          onClose={() => setIsVizOpen(false)}
          data={vizData}
          title="Receivables: Paid vs Unpaid vs Overdue"
          chartType="bar"
          xAxisKey="category"
          dataKeys={[
            { key: 'amount', name: 'Amount (₹)', color: 'hsl(var(--primary))' },
            { key: 'count', name: 'Count', color: 'hsl(142, 76%, 36%)' },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
