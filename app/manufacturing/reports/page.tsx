'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { AuthSplash } from '@/components/dashboard/AuthSplash';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, BarChart3, Download, TrendingUp, TrendingDown, FileSpreadsheet, FileText } from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { UsersGraph } from '@/components/admin/graphics/UsersGraph';
import { ActivePulse } from '@/components/admin/graphics/ActivePulse';
import { InactiveOrbit } from '@/components/admin/graphics/InactiveOrbit';
import { ManufacturingVisualization } from '@/components/manufacturing/ManufacturingVisualization';
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

// Same "print → Save as PDF" pattern used across the Finance report pages
// (Balance Sheet, Trial Balance, P&L) — no extra PDF library needed.
function downloadPdf(title: string, headers: string[], rows: (string | number)[][]) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Please allow popups to export as PDF');
    return;
  }
  const escapeHtml = (v: string | number) => String(v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const html = `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    p { color: #666; font-size: 12px; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 12px; }
    th { background: #f3f3f3; font-weight: 600; }
  </style></head><body>
    <h1>${escapeHtml(title.replace(/-/g, ' '))}</h1>
    <p>Generated ${new Date().toLocaleDateString()}</p>
    <table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <script>window.onload = () => { window.print(); };</script>
  </body></html>`;
  printWindow.document.write(html);
  printWindow.document.close();
  toast.success(`${title} ready — use "Save as PDF" in the print dialog`);
}

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showVisualization, setShowVisualization] = useState(false);
  const [selectedReport, setSelectedReport] = useState('shipments');
  const [visualizationData, setVisualizationData] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalShipments: 0,
    onTimeRate: 0,
    avgTransitDays: 0,
    customsDelays: 0,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    }
    // Any authenticated user (incl. admin / master-admin) may view this — the
    // old role gate bounced admins to /auth/manufacturing → admin dashboard.
  }, [status, router, session]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/manufacturing/shipments');
      const data = await res.json();
      const shipments: any[] = data.shipments || [];

      const delivered = shipments.filter((s) => s.status === 'delivered' && s.estimatedDelivery && s.actualDelivery);
      const onTime = delivered.filter((s) => new Date(s.actualDelivery) <= new Date(s.estimatedDelivery));
      const transitDays = delivered
        .map((s) => (new Date(s.actualDelivery).getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        .filter((d) => d >= 0);
      const customsDelays = shipments.filter((s) => s.status === 'delayed' || s.customsStatus === 'held').length;

      setStats({
        totalShipments: shipments.length,
        onTimeRate: delivered.length > 0 ? Math.round((onTime.length / delivered.length) * 1000) / 10 : 0,
        avgTransitDays: transitDays.length > 0 ? Math.round((transitDays.reduce((a, b) => a + b, 0) / transitDays.length) * 10) / 10 : 0,
        customsDelays,
      });
    } catch {
      toast.error('Failed to load report stats');
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') loadStats();
  }, [status, loadStats]);

  const [pendingReport, setPendingReport] = useState<{ title: string; headers: string[]; rows: (string | number)[][] } | null>(null);

  // Fetches + shapes the data for the selected report, then asks the user
  // CSV or PDF instead of guessing — the actual export happens in
  // exportPendingReport once they pick a format.
  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      if (selectedReport === 'customs') {
        const res = await fetch('/api/manufacturing/customs-clearance');
        const data = await res.json();
        const rows = (data.clearances || []).map((c: any) => [
          c.clearanceNumber, c.status, c.customsStatus || '', new Date(c.createdAt).toISOString().split('T')[0],
        ]);
        setPendingReport({ title: 'customs-report', headers: ['Clearance Number', 'Status', 'Customs Status', 'Date'], rows });
      } else {
        const res = await fetch('/api/manufacturing/shipments');
        const data = await res.json();
        const rows = (data.shipments || []).map((s: any) => [
          s.shipmentNumber, s.customerName, s.origin, s.destination, s.shipmentType, s.status, s.totalValue,
          new Date(s.createdAt).toISOString().split('T')[0],
        ]);
        setPendingReport({
          title: selectedReport === 'freight' ? 'freight-analysis' : selectedReport === 'performance' ? 'performance-metrics' : 'shipments-report',
          headers: ['Shipment Number', 'Customer', 'Origin', 'Destination', 'Type', 'Status', 'Value', 'Date'],
          rows,
        });
      }
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportPendingReport = (format: 'csv' | 'pdf') => {
    if (!pendingReport) return;
    if (format === 'csv') downloadCsv(pendingReport.title, pendingReport.headers, pendingReport.rows);
    else downloadPdf(pendingReport.title, pendingReport.headers, pendingReport.rows);
    setPendingReport(null);
  };

  const loadVisualizationData = async () => {
    try {
      const res = await fetch('/api/manufacturing/analytics');
      const data = await res.json();
      const chartData =
        selectedReport === 'shipments'
          ? (data.shipments || []).map((d: any) => ({ name: d.month, value: d.count }))
          : (data.status || []).map((d: any) => ({ name: d.name, value: d.value }));

      if (chartData.length === 0) {
        toast.info('No data yet for this report type');
      }
      setVisualizationData(chartData);
      setShowVisualization(true);
    } catch {
      toast.error('Failed to load analytics data');
    }
  };

  if (status === 'loading') {
    return <AuthSplash />;
  }

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing"
      pageName="Reports"
      breadcrumbs={[
        { label: 'Manufacturing', href: '/manufacturing/dashboard' },
        { label: 'Reports' },
      ]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground dark:text-white">Reports & Analytics</h1>
          <p className="mt-2 text-muted-foreground dark:text-muted-foreground">
            Generate and analyze manufacturing reports
          </p>
        </div>

        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Shipments"
            value={stats.totalShipments}
            subtitle="all time"
            visual={<UsersGraph />}
          />
          <StatCard
            title="On-Time Delivery"
            value={`${stats.onTimeRate}%`}
            subtitle="of delivered shipments"
            visual={<ActivePulse />}
          />
          <StatCard
            title="Avg Transit Time"
            value={`${stats.avgTransitDays} days`}
            subtitle="delivered shipments"
            visual={<UsersGraph />}
          />
          <StatCard
            title="Customs Delays"
            value={stats.customsDelays}
            subtitle="delayed or held"
            visual={<InactiveOrbit />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground dark:text-foreground mb-2 block">
                  Report Type
                </label>
                <Select value={selectedReport} onValueChange={setSelectedReport}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shipments">Shipments Report</SelectItem>
                    <SelectItem value="freight">Freight Analysis</SelectItem>
                    <SelectItem value="customs">Customs Report</SelectItem>
                    <SelectItem value="performance">Performance Metrics</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleGenerateReport}
                disabled={isGenerating}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Download className="mr-2 h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Generate Report'}
              </Button>
              <Button
                onClick={loadVisualizationData}
                variant="outline"
                className="border-blue-800 text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950"
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                View Analytics
              </Button>
            </div>
          </CardContent>
        </Card>

        <ManufacturingVisualization
          isOpen={showVisualization}
          onClose={() => setShowVisualization(false)}
          data={visualizationData}
          title={selectedReport === 'shipments' ? 'Shipments Over Time' : 'Shipment Status Distribution'}
          chartType={selectedReport === 'shipments' ? 'line' : 'bar'}
          xAxisKey="name"
          dataKeys={[{ key: 'value', name: 'Count', color: '#ea580c' }]}
        />

        <Dialog open={!!pendingReport} onOpenChange={(open) => !open && setPendingReport(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Export report as…</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {pendingReport?.rows.length ?? 0} row{pendingReport?.rows.length === 1 ? '' : 's'} ready. Choose a format.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => exportPendingReport('csv')}>
                <FileSpreadsheet className="h-6 w-6" />
                CSV
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => exportPendingReport('pdf')}>
                <FileText className="h-6 w-6" />
                PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
