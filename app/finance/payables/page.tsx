'use client';

import { useEffect, useState, useCallback } from 'react';
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { financeSidebarConfig } from '@/config/sidebar/finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangeFilter } from '@/components/shared/DateRangeFilter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckCircle, BarChart3, DollarSign, Clock, AlertCircle, Search } from 'lucide-react';
import { StatsRowSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { DraggableVisualization } from '@/components/finance/DraggableVisualization';

interface Bill {
  _id: string;
  billNumber: string;
  vendorName: string;
  vendorEmail: string;
  total: number;
  currency: string;
  status: string;
  issueDate: string;
  dueDate: string;
}

export default function PayablesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [bills, setBills] = useState<Bill[]>([]);
  // Separate, unpaginated fetch used only for the KPI cards + Visualize
  // dialog — those need totals across every matching bill, not just the
  // current page of 10 shown in the table below.
  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 10;
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Visualization state
  const [isVizOpen, setIsVizOpen] = useState(false);
  const [vizData, setVizData] = useState<Record<string, string | number>[]>([]);
  
  const [newBill, setNewBill] = useState({
    billNumber: '',
    vendorId: '',
    vendorName: '',
    vendorEmail: '',
    items: [{ description: '', quantity: 1, rate: 0, amount: 0 }],
    subtotal: 0,
    taxRate: 18,
    taxAmount: 0,
    total: 0,
    currency: 'INR',
    status: 'pending',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: '',
  });

  const fetchBills = useCallback(async (currentPage: number, search: string, statusF: string, from: string, to: string) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (statusF && statusF !== 'all') params.append('status', statusF);
      if (search) params.append('search', search);
      if (from) params.append('dateFrom', from);
      if (to) params.append('dateTo', to);

      const res = await cachedFetch(`/api/finance/bills?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch bills');

      const data = await res.json();
      setBills(data.bills);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      console.error('Error fetching bills:', err);
      setError('Failed to load bills');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAllBillsForStats = useCallback(async (statusF: string, from: string, to: string) => {
    try {
      const params = new URLSearchParams({ page: '1', limit: '1000' });
      if (statusF && statusF !== 'all') params.append('status', statusF);
      if (from) params.append('dateFrom', from);
      if (to) params.append('dateTo', to);
      const res = await cachedFetch(`/api/finance/bills?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setAllBills(data.bills || []);
    } catch (err) {
      console.error('Error fetching bill stats:', err);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (status === "authenticated") {
      if (session?.user?.role !== 'finance' && session?.user?.role !== 'admin') {
        router.push('/auth/finance');
      } else {
        fetchBills(page, debouncedQuery, statusFilter, dateFrom, dateTo);
      }
    }
  }, [status, router, session, fetchBills, page, debouncedQuery, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (status === "authenticated") fetchAllBillsForStats(statusFilter, dateFrom, dateTo);
  }, [status, fetchAllBillsForStats, statusFilter, dateFrom, dateTo]);

  const handleAddItem = () => {
    setNewBill({
      ...newBill,
      items: [...newBill.items, { description: '', quantity: 1, rate: 0, amount: 0 }],
    });
  };

  const handleItemChange = (index: number, field: string, value: string | number) => {
    const updatedItems = [...newBill.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'rate') {
      updatedItems[index].amount = updatedItems[index].quantity * updatedItems[index].rate;
    }
    
    setNewBill({ ...newBill, items: updatedItems });
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Calculate totals inline to avoid state update delay
      const subtotal = newBill.items.reduce((sum, item) => sum + item.amount, 0);
      const taxAmount = (subtotal * newBill.taxRate) / 100;
      const total = subtotal + taxAmount;
      
      const billData = {
        ...newBill,
        vendorId: newBill.vendorEmail,
        subtotal,
        taxAmount,
        total,
      };
      
      const res = await cachedFetch('/api/finance/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create bill');
      }

      setIsAddDialogOpen(false);
      setNewBill({
        billNumber: '',
        vendorId: '',
        vendorName: '',
        vendorEmail: '',
        items: [{ description: '', quantity: 1, rate: 0, amount: 0 }],
        subtotal: 0,
        taxRate: 18,
        taxAmount: 0,
        total: 0,
        currency: 'INR',
        status: 'pending',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: '',
      });
      fetchBills(page, debouncedQuery, statusFilter, dateFrom, dateTo);
      fetchAllBillsForStats(statusFilter, dateFrom, dateTo);
    } catch (err) {
      console.error('Error creating bill:', err);
      setError('Failed to create bill');
    }
  };

  const handleMarkPaid = async (billId: string) => {
    try {
      const res = await cachedFetch(`/api/finance/bills/${billId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paidDate: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error('Failed to update bill');

      fetchBills(page, debouncedQuery, statusFilter, dateFrom, dateTo);
      fetchAllBillsForStats(statusFilter, dateFrom, dateTo);
    } catch (err) {
      console.error('Error updating bill:', err);
      setError('Failed to mark bill as paid');
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  const getStatusBadge = (status: string) => {
    const config = {
      draft: { className: 'bg-muted text-muted-foreground border-border', label: 'Draft' },
      pending: { className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', label: 'Pending' },
      paid: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Paid' },
      overdue: { className: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Overdue' },
    };
    
    const style = config[status as keyof typeof config] || config.pending;
    
    return (
      <Badge className={`${style.className} border font-medium`} variant="outline">
        {style.label}
      </Badge>
    );
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance Dashboard"
        pageName="Accounts Payable"
        breadcrumbs={[{ label: 'Dashboard', href: '/finance/summary' }, { label: 'Payables' }]}
        profilePath="/finance/profile"
        userName={session?.user?.name || 'User'}
        userEmail={session?.user?.email || ''}
        userRole={session?.user?.role || 'finance'}
        onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      >
        <div className="space-y-6">
          <div><div className="h-9 w-72 bg-muted animate-pulse rounded mb-2" /><div className="h-5 w-96 bg-muted animate-pulse rounded" /></div>
          <StatsRowSkeleton count={4} />
          <Card><CardContent className="pt-6"><TableSkeleton rows={8} columns={7} /></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  const filteredBills = bills;

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance Dashboard"
      pageName="Accounts Payable"
      breadcrumbs={[
        { label: 'Dashboard', href: '/finance/summary' },
        { label: 'Payables' }
      ]}
      profilePath="/finance/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      onRefresh={() => { fetchBills(page, debouncedQuery, statusFilter, dateFrom, dateTo); fetchAllBillsForStats(statusFilter, dateFrom, dateTo); }}
    >
      <div className="space-y-6">
        <FinancePageHeader
          title="Accounts Payable"
          description="Manage vendor bills and track payments"
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const paidTotal = allBills.filter(b => b.status === 'paid').reduce((sum, b) => sum + b.total, 0);
                  const unpaidTotal = allBills.filter(b => b.status === 'pending' || b.status === 'draft').reduce((sum, b) => sum + b.total, 0);
                  const overdueTotal = allBills.filter(b => b.status === 'overdue').reduce((sum, b) => sum + b.total, 0);

                  setVizData([
                    { category: 'Paid', amount: paidTotal, count: allBills.filter(b => b.status === 'paid').length },
                    { category: 'Unpaid', amount: unpaidTotal, count: allBills.filter(b => b.status === 'pending' || b.status === 'draft').length },
                    { category: 'Overdue', amount: overdueTotal, count: allBills.filter(b => b.status === 'overdue').length },
                  ]);
                  setIsVizOpen(true);
                }}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Visualize
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Bill
                  </Button>
                </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Bill</DialogTitle>
                <DialogDescription>Fill in the details to create a new bill from your vendor</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateBill} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="billNumber">Bill Number *</Label>
                    <Input
                      id="billNumber"
                      value={newBill.billNumber}
                      onChange={(e) => setNewBill({ ...newBill, billNumber: e.target.value })}
                      placeholder="BILL-001"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorName">Vendor Name *</Label>
                    <Input
                      id="vendorName"
                      value={newBill.vendorName}
                      onChange={(e) => setNewBill({ ...newBill, vendorName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorEmail">Vendor Email *</Label>
                    <Input
                      id="vendorEmail"
                      type="email"
                      value={newBill.vendorEmail}
                      onChange={(e) => setNewBill({ ...newBill, vendorEmail: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="issueDate">Issue Date *</Label>
                    <Input
                      id="issueDate"
                      type="date"
                      value={newBill.issueDate}
                      onChange={(e) => setNewBill({ ...newBill, issueDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date *</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={newBill.dueDate}
                      onChange={(e) => setNewBill({ ...newBill, dueDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Line Items</Label>
                  {newBill.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-4 gap-2">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        required
                      />
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                        required
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Rate"
                        value={item.rate}
                        onChange={(e) => handleItemChange(index, 'rate', parseFloat(e.target.value))}
                        required
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={item.amount}
                        disabled
                      />
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                    Add Item
                  </Button>
                </div>

                <div className="bg-muted/30 p-4 rounded-none space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-medium">
                      {newBill.currency} {newBill.items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ({newBill.taxRate}%):</span>
                    <span className="font-medium">
                      {newBill.currency} {((newBill.items.reduce((sum, item) => sum + item.amount, 0) * newBill.taxRate) / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-semibold pt-2 border-t">
                    <span>Total:</span>
                    <span>
                      {newBill.currency} {(newBill.items.reduce((sum, item) => sum + item.amount, 0) * (1 + newBill.taxRate / 100)).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-foreground hover:bg-foreground/90 text-background">
                    Create Bill
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
            </>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
              <DollarSign className="h-4 w-4 text-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-sans tabular-nums">₹{allBills.reduce((sum, bill) => sum + bill.total, 0).toLocaleString('en-IN')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{allBills.filter(b => b.status === 'pending').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Paid</CardTitle>
              <CheckCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{allBills.filter(b => b.status === 'paid').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{allBills.filter(b => b.status === 'overdue').length}</div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none">
            {error}
          </div>
        )}

        <Card className="border-border/40">
          <CardHeader className="bg-muted/30">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold">
                Bills
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({total} total)
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search bill #..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9 w-56 bg-background"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
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
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold">Bill #</TableHead>
                  <TableHead className="font-semibold">Vendor</TableHead>
                  <TableHead className="font-semibold">Issue Date</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="text-right font-semibold">Amount</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {query || statusFilter !== 'all' || dateFrom || dateTo
                        ? "No bills match your search or filters."
                        : "No bills found. Create your first bill to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBills.map((bill) => (
                    <TableRow key={bill._id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{bill.billNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{bill.vendorName}</div>
                        <div className="text-xs text-muted-foreground">{bill.vendorEmail}</div>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(bill.issueDate)}</TableCell>
                      <TableCell className="text-sm">{formatDate(bill.dueDate)}</TableCell>
                      <TableCell className="text-right font-semibold font-sans tabular-nums">
                        {formatCurrency(bill.total)}
                      </TableCell>
                      <TableCell>{getStatusBadge(bill.status)}</TableCell>
                      <TableCell>
                        {(bill.status === 'pending' || bill.status === 'overdue') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkPaid(bill._id)}
                            className="h-8"
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Mark Paid
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DraggableVisualization
        isOpen={isVizOpen}
        onClose={() => setIsVizOpen(false)}
        data={vizData}
        title="Payables: Paid vs Unpaid vs Overdue"
        chartType="bar"
        xAxisKey="category"
        dataKeys={[
          { key: 'amount', name: 'Amount (₹)', color: 'hsl(var(--primary))' },
          { key: 'count', name: 'Count', color: 'hsl(142, 76%, 36%)' },
        ]}
      />
    </DashboardLayout>
  );
}
