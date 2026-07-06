'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, BarChart3, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { StatCard } from '@/components/manufacturing/StatCard';
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
    } else if (status === 'authenticated' && session?.user?.role !== 'manufacturing') {
      router.push('/auth/manufacturing');
    }
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

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      if (selectedReport === 'customs') {
        const res = await fetch('/api/manufacturing/customs-clearance');
        const data = await res.json();
        const rows = (data.clearances || []).map((c: any) => [
          c.clearanceNumber, c.status, c.customsStatus || '', new Date(c.createdAt).toISOString().split('T')[0],
        ]);
        downloadCsv('customs-report', ['Clearance Number', 'Status', 'Customs Status', 'Date'], rows);
      } else {
        const res = await fetch('/api/manufacturing/shipments');
        const data = await res.json();
        const rows = (data.shipments || []).map((s: any) => [
          s.shipmentNumber, s.customerName, s.origin, s.destination, s.shipmentType, s.status, s.totalValue,
          new Date(s.createdAt).toISOString().split('T')[0],
        ]);
        downloadCsv(
          selectedReport === 'freight' ? 'freight-analysis' : selectedReport === 'performance' ? 'performance-metrics' : 'shipments-report',
          ['Shipment Number', 'Customer', 'Origin', 'Destination', 'Type', 'Status', 'Value', 'Date'],
          rows,
        );
      }
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
      </div>
    );
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Reports & Analytics</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Generate and analyze manufacturing reports
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Shipments"
            value={stats.totalShipments}
            icon={BarChart3}
            description="all time"
            colorClass="text-blue-800 dark:text-blue-400"
          />
          <StatCard
            title="On-Time Delivery"
            value={`${stats.onTimeRate}%`}
            icon={TrendingUp}
            description="of delivered shipments"
            colorClass="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            title="Avg Transit Time"
            value={`${stats.avgTransitDays} days`}
            icon={TrendingDown}
            description="delivered shipments"
            colorClass="text-blue-800 dark:text-blue-400"
          />
          <StatCard
            title="Customs Delays"
            value={stats.customsDelays}
            icon={TrendingDown}
            description="delayed or held"
            colorClass="text-red-600 dark:text-red-400"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
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
                className="bg-blue-800 hover:bg-blue-700 text-white"
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
      </div>
    </DashboardLayout>
  );
}
