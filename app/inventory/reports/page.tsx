'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, Download } from 'lucide-react';
import { toast } from 'sonner';

function downloadCsv(title: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`${title} exported`);
}

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/inventory');
    } else if (status === 'authenticated' && session?.user?.role !== 'inventory' && session?.user?.role !== 'admin') {
      router.push('/auth/inventory');
    }
  }, [status, router, session]);

  const downloadStockReport = useCallback(async () => {
    setDownloading('stock');
    try {
      const [stockRes, productsRes] = await Promise.all([
        fetch('/api/inventory/stock'),
        fetch('/api/sales/products'),
      ]);
      const stockData = await stockRes.json();
      const productsData = await productsRes.json();
      const productsById = new Map((productsData.items || []).map((p: any) => [p._id, p]));

      const rows = Object.entries(stockData.stock || {}).map(([productId, quantity]) => {
        const product: any = productsById.get(productId);
        const unitCost = product?.tab_general_information?.standard_price || 0;
        return [
          product?.header?.name || productId,
          product?.tab_general_information?.default_code || '',
          quantity as number,
          unitCost,
          Number(quantity) * unitCost,
        ];
      });

      downloadCsv('stock-report', ['Product', 'Code', 'Quantity On Hand', 'Unit Cost', 'Total Value'], rows);
    } catch {
      toast.error('Failed to generate stock report');
    } finally {
      setDownloading(null);
    }
  }, []);

  const downloadMovementReport = useCallback(async () => {
    setDownloading('movement');
    try {
      const res = await fetch('/api/inventory/stock-moves');
      const data = await res.json();
      const rows = (data.items || []).flatMap((move: any) =>
        (move.lines || []).map((line: any) => [
          move.reference,
          move.moveType,
          move.moveStatus,
          line.productId?.header?.name || line.productName || '',
          line.demand,
          new Date(move.createdAt).toISOString().split('T')[0],
        ]),
      );
      downloadCsv('movement-report', ['Reference', 'Type', 'Status', 'Product', 'Quantity', 'Date'], rows);
    } catch {
      toast.error('Failed to generate movement report');
    } finally {
      setDownloading(null);
    }
  }, []);

  const downloadAgingReport = useCallback(async () => {
    setDownloading('aging');
    try {
      const res = await fetch('/api/inventory/batch');
      const data = await res.json();
      const now = Date.now();
      const rows = (data.batches || []).map((batch: any) => {
        const ageDays = Math.floor((now - new Date(batch.manufactureDate).getTime()) / (1000 * 60 * 60 * 24));
        return [batch.batchNumber, batch.itemName, batch.quantity, ageDays, batch.status];
      });
      if (rows.length === 0) toast.info('No batch/lot records yet — exported an empty report');
      downloadCsv('aging-report', ['Batch Number', 'Item', 'Quantity', 'Age (Days)', 'Status'], rows);
    } catch {
      toast.error('Failed to generate aging report');
    } finally {
      setDownloading(null);
    }
  }, []);

  const downloadComplianceReport = useCallback(async () => {
    setDownloading('compliance');
    try {
      const res = await fetch('/api/inventory/batch');
      const data = await res.json();
      const rows = (data.batches || [])
        .filter((batch: any) => batch.bondedWarehouse || batch.customsStatus)
        .map((batch: any) => [
          batch.batchNumber,
          batch.itemName,
          batch.bondedWarehouse ? 'Yes' : 'No',
          batch.customsStatus || 'n/a',
          batch.expiryDate ? new Date(batch.expiryDate).toISOString().split('T')[0] : '',
        ]);
      if (rows.length === 0) toast.info('No bonded-warehouse batch records yet — exported an empty report');
      downloadCsv('compliance-report', ['Batch Number', 'Item', 'Bonded Warehouse', 'Customs Status', 'Expiry Date'], rows);
    } catch {
      toast.error('Failed to generate compliance report');
    } finally {
      setDownloading(null);
    }
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Reports"
      breadcrumbs={[
        { label: 'Dashboard', href: '/inventory/summary' },
        { label: 'Reports' }
      ]}
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/inventory' })}
      profilePath="/inventory/profile"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Inventory Reports</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Generate and download inventory reports
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-800" />
                Stock Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Complete stock summary with current quantities and values
              </p>
              <Button onClick={downloadStockReport} disabled={downloading === 'stock'}>
                <Download className="h-4 w-4 mr-2" />
                {downloading === 'stock' ? 'Generating...' : 'Download Report'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-600" />
                Movement Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Track stock movements, inbound and outbound transactions
              </p>
              <Button onClick={downloadMovementReport} disabled={downloading === 'movement'}>
                <Download className="h-4 w-4 mr-2" />
                {downloading === 'movement' ? 'Generating...' : 'Download Report'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-purple-600" />
                Aging Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Analyze stock age and identify slow-moving items
              </p>
              <Button onClick={downloadAgingReport} disabled={downloading === 'aging'}>
                <Download className="h-4 w-4 mr-2" />
                {downloading === 'aging' ? 'Generating...' : 'Download Report'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-800" />
                Compliance Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Bonded warehouse compliance and regulatory reports
              </p>
              <Button onClick={downloadComplianceReport} disabled={downloading === 'compliance'}>
                <Download className="h-4 w-4 mr-2" />
                {downloading === 'compliance' ? 'Generating...' : 'Download Report'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
