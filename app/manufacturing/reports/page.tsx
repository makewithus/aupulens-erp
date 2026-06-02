'use client';

import { useEffect, useState } from 'react';
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
import { useToast } from '@/components/ui/use-toast';

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showVisualization, setShowVisualization] = useState(false);
  const [selectedReport, setSelectedReport] = useState('shipments');
  const [visualizationData, setVisualizationData] = useState<any[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated' && session?.user?.role !== 'manufacturing') {
      router.push('/auth/manufacturing');
    }
  }, [status, router, session]);

  const handleGenerateReport = () => {
    toast({
      title: 'Generating Report',
      description: 'Your report is being generated...',
    });

    // Simulate report generation
    setTimeout(() => {
      toast({
        title: 'Report Ready',
        description: 'Your report has been generated successfully',
      });
    }, 2000);
  };

  const loadVisualizationData = () => {
    // Sample data based on selected report type
    const data = selectedReport === 'shipments'
      ? [
          { name: 'Jan', value: 45 },
          { name: 'Feb', value: 52 },
          { name: 'Mar', value: 48 },
          { name: 'Apr', value: 61 },
          { name: 'May', value: 58 },
          { name: 'Jun', value: 67 },
        ]
      : [
          { name: 'Air', value: 120 },
          { name: 'Sea', value: 85 },
          { name: 'Road', value: 45 },
          { name: 'Rail', value: 32 },
        ];

    setVisualizationData(data);
    setShowVisualization(true);
  };

  if (status === 'loading' || isLoading) {
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
            value={331}
            icon={BarChart3}
            trend={{ value: 12.5, isPositive: true }}
            description="vs last month"
            colorClass="text-blue-800 dark:text-blue-400"
          />
          <StatCard
            title="On-Time Delivery"
            value="94.2%"
            icon={TrendingUp}
            trend={{ value: 2.3, isPositive: true }}
            description="vs last month"
            colorClass="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            title="Avg Transit Time"
            value="7.5 days"
            icon={TrendingDown}
            trend={{ value: 1.2, isPositive: false }}
            description="vs last month"
            colorClass="text-blue-800 dark:text-blue-400"
          />
          <StatCard
            title="Customs Delays"
            value={18}
            icon={TrendingDown}
            trend={{ value: 5.8, isPositive: false }}
            description="vs last month"
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
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Time Period
                </label>
                <Select defaultValue="month">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Last Week</SelectItem>
                    <SelectItem value="month">Last Month</SelectItem>
                    <SelectItem value="quarter">Last Quarter</SelectItem>
                    <SelectItem value="year">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Format
                </label>
                <Select defaultValue="pdf">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleGenerateReport}
                className="bg-blue-800 hover:bg-blue-700 text-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Generate Report
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

        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'Shipments Report - June 2024', date: '2024-06-01', type: 'PDF' },
                { name: 'Freight Analysis - Q2 2024', date: '2024-05-15', type: 'Excel' },
                { name: 'Customs Report - May 2024', date: '2024-05-01', type: 'PDF' },
              ].map((report, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-none border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <BarChart3 className="h-5 w-5 text-blue-800" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{report.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(report.date).toLocaleDateString()} • {report.type}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-800 hover:text-blue-700"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <ManufacturingVisualization
          isOpen={showVisualization}
          onClose={() => setShowVisualization(false)}
          data={visualizationData}
          title={selectedReport === 'shipments' ? 'Shipments Over Time' : 'Freight by Type'}
          chartType={selectedReport === 'shipments' ? 'line' : 'bar'}
          xAxisKey="name"
          dataKeys={[{ key: 'value', name: 'Count', color: '#ea580c' }]}
        />
      </div>
    </DashboardLayout>
  );
}
