'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { salesSidebarConfig } from '@/config/sidebar/sales';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Package, Globe, Download, Eye, Calendar, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { TableSkeleton } from '@/components/ui/loading-skeletons';

interface SalesOrder {
  _id: string;
  orderNumber: string;
  customer: string;
  customerEmail?: string;
  items: { description: string; quantity: number; price: number; amount: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: string;
  shippingAddress?: string;
  createdAt: string;
}

export default function ExportDocsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exportingDoc, setExportingDoc] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/sales');
    } else if (status === 'authenticated' && session?.user?.role !== 'sales' && session?.user?.role !== 'admin') {
      router.push('/auth/sales');
    }
  }, [status, router, session]);

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/sales/orders');
      if (response.ok) {
        const data = await response.json();
        // Only show shipped and delivered orders for export docs
        const exportableOrders = data.orders.filter((order: SalesOrder) => 
          ['shipped', 'delivered'].includes(order.status)
        );
        setOrders(exportableOrders);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load orders',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchOrders();
    }
  }, [status, fetchOrders]);

  const generateBillOfLading = async (order: SalesOrder) => {
    setExportingDoc(`bl-${order._id}`);
    try {
      const doc = {
        documentType: 'Bill of Lading',
        orderNumber: order.orderNumber,
        date: new Date().toLocaleDateString(),
        shipper: 'Aupulens Enterprises',
        consignee: order.customer,
        address: order.shippingAddress || 'N/A',
        items: order.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          weight: 'TBD'
        })),
        total: order.total,
        generatedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BL_${order.orderNumber}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Bill of Lading Generated',
        description: `Document for order ${order.orderNumber} has been downloaded`
      });
    } catch (error) {
      console.error('Error generating B/L:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate Bill of Lading',
        variant: 'destructive'
      });
    } finally {
      setExportingDoc(null);
    }
  };

  const generateCommercialInvoice = async (order: SalesOrder) => {
    setExportingDoc(`ci-${order._id}`);
    try {
      const doc = {
        documentType: 'Commercial Invoice',
        invoiceNumber: `CI-${order.orderNumber}`,
        date: new Date().toLocaleDateString(),
        seller: {
          name: 'Aupulens Enterprises',
          address: 'Export Division, International Trade Center'
        },
        buyer: {
          name: order.customer,
          email: order.customerEmail,
          address: order.shippingAddress
        },
        items: order.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.price,
          amount: item.amount
        })),
        subtotal: order.subtotal,
        taxRate: order.taxRate,
        taxAmount: order.taxAmount,
        total: order.total,
        currency: 'USD',
        paymentTerms: 'Net 30',
        generatedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CommercialInvoice_${order.orderNumber}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Commercial Invoice Generated',
        description: `Invoice for order ${order.orderNumber} has been downloaded`
      });
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate Commercial Invoice',
        variant: 'destructive'
      });
    } finally {
      setExportingDoc(null);
    }
  };

  const generatePackingList = async (order: SalesOrder) => {
    setExportingDoc(`pl-${order._id}`);
    try {
      const doc = {
        documentType: 'Packing List',
        listNumber: `PL-${order.orderNumber}`,
        date: new Date().toLocaleDateString(),
        shipper: 'Aupulens Enterprises',
        consignee: order.customer,
        orderReference: order.orderNumber,
        items: order.items.map((item, index) => ({
          packageNumber: index + 1,
          description: item.description,
          quantity: item.quantity,
          weight: 'TBD',
          dimensions: 'TBD',
          marks: `PKG-${index + 1}`
        })),
        totalPackages: order.items.length,
        totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
        generatedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PackingList_${order.orderNumber}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Packing List Generated',
        description: `Packing list for order ${order.orderNumber} has been downloaded`
      });
    } catch (error) {
      console.error('Error generating packing list:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate Packing List',
        variant: 'destructive'
      });
    } finally {
      setExportingDoc(null);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout
        sidebarSections={salesSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Sales"
        pageName="Export Documentation"
        breadcrumbs={[{ label: 'Sales', href: '/sales/summary' }, { label: 'Export Docs' }]}
        userName={session?.user?.name || 'User'}
        userRole={session?.user?.role || 'sales'}
        onSignOut={() => signOut({ callbackUrl: '/auth/sales' })}
        profileHref="/sales/profile"
      >
        <TableSkeleton />
      </DashboardLayout>
    );
  }

  if (!session) return null;

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Export Documentation"
      breadcrumbs={[{ label: 'Sales', href: '/sales/summary' }, { label: 'Export Docs' }]}
      userName={session?.user?.name || 'User'}
      userRole={session?.user?.role || 'sales'}
      onSignOut={() => signOut({ callbackUrl: '/auth/sales' })}
      profileHref="/sales/profile"
    >
      <Toaster />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Export Documentation</h1>
          <p className="text-sm text-muted-foreground">Generate export documents for international shipments</p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-none">
                  <FileText className="h-6 w-6 text-blue-800 dark:text-blue-300" />
                </div>
                <div>
                  <CardTitle>Bill of Lading</CardTitle>
                  <CardDescription className="mt-1">Shipping documents</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                Generate Bill of Lading for international shipments with detailed cargo information.
              </p>
              <div className="text-2xl font-bold text-blue-800 dark:text-blue-300 mb-4">
                {orders.length} Available
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-none">
                  <Globe className="h-6 w-6 text-green-600 dark:text-green-300" />
                </div>
                <div>
                  <CardTitle>Commercial Invoice</CardTitle>
                  <CardDescription className="mt-1">Export invoices</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                Create commercial invoices for customs clearance and international trade compliance.
              </p>
              <div className="text-2xl font-bold text-green-600 dark:text-green-300 mb-4">
                {orders.length} Available
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-none">
                  <Package className="h-6 w-6 text-purple-600 dark:text-purple-300" />
                </div>
                <div>
                  <CardTitle>Packing List</CardTitle>
                  <CardDescription className="mt-1">Itemized details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                Generate detailed packing lists with item specifications and package information.
              </p>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-300 mb-4">
                {orders.length} Available
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Exportable Orders</CardTitle>
            <CardDescription>Generate export documentation for shipped and delivered orders</CardDescription>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium mb-2">No exportable orders</p>
                <p className="text-sm">Orders must be in &ldquo;shipped&rdquo; or &ldquo;delivered&rdquo; status to generate export documents</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order._id}
                    className="border rounded-none p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{order.orderNumber}</h3>
                          <Badge variant={order.status === 'delivered' ? 'default' : 'secondary'}>
                            {order.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>{order.customer}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="mt-2">
                          <p className="text-sm text-muted-foreground">
                            {order.items.length} items • Total: ${order.total.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-3 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateBillOfLading(order)}
                        disabled={exportingDoc === `bl-${order._id}`}
                      >
                        {exportingDoc === `bl-${order._id}`? (
                          <>
                            <div className="h-4 w-4 mr-2 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Bill of Lading
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateCommercialInvoice(order)}
                        disabled={exportingDoc === `ci-${order._id}`}
                      >
                        {exportingDoc === `ci-${order._id}` ? (
                          <>
                            <div className="h-4 w-4 mr-2 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Commercial Invoice
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generatePackingList(order)}
                        disabled={exportingDoc === `pl-${order._id}`}
                      >
                        {exportingDoc === `pl-${order._id}` ? (
                          <>
                            <div className="h-4 w-4 mr-2 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Packing List
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}



