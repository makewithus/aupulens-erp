'use client';

import { useEffect, useState } from 'react';
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useAiPrefill } from '@/lib/hooks/useAiPrefill';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Download,
  BarChart,
  RefreshCw,
  CheckCircle2,
  Printer,
} from 'lucide-react';
import * as xlsx from 'xlsx';

const reportTypes = [
  {
    value: 'stock',
    label: 'Stock Report',
    description: 'Complete stock summary with current quantities, unit costs, and valuations.',
  },
  {
    value: 'movement',
    label: 'Movement Report',
    description: 'Track stock movements, inbound and outbound transactions over time.',
  },
  {
    value: 'aging',
    label: 'Aging Report',
    description: 'Analyze stock batch age in days and identify slow-moving items.',
  },
  {
    value: 'compliance',
    label: 'Compliance Report',
    description: 'Bonded warehouse compliance, customs status, and batch expiry tracking.',
  },
];

const dateRanges = [
  { value: 'all', label: 'All Time' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
];

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [reportType, setReportType] = useState('stock');
  const [dateRange, setDateRange] = useState('last_30_days');
  const [pendingGenerate, setPendingGenerate] = useState(false);

  // AI-native: "generate a stock report for last 30 days" sets the type + range
  // and generates it automatically.
  useAiPrefill('inventory_report', (p) => {
    const d: any = p.data || {};
    if (['stock', 'movement', 'aging', 'compliance'].includes(d.report_type)) setReportType(d.report_type);
    if (['all', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'this_year'].includes(d.date_range)) setDateRange(d.date_range);
    setPendingGenerate(true);
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<{
    type: string;
    headers: string[];
    rows: (string | number)[][];
    title: string;
  } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/inventory');
    } else if (status === 'authenticated' && session?.user?.role !== 'inventory' && session?.user?.role !== 'admin') {
      router.push('/auth/inventory');
    }
  }, [status, router, session]);

  const fetchStockReport = async () => {
    const [stockRes, productsRes] = await Promise.all([
      cachedFetch('/api/inventory/stock'),
      cachedFetch('/api/sales/products?limit=1000'),
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

    return {
      headers: ['Product', 'Code', 'Quantity On Hand', 'Unit Cost', 'Total Value'],
      rows,
    };
  };

  const fetchMovementReport = async (range: string) => {
    const res = await cachedFetch('/api/inventory/stock-moves');
    const data = await res.json();
    let items = data.items || [];

    if (range !== 'all') {
      const now = new Date();
      let cutoff = new Date();
      if (range === 'last_7_days') {
        cutoff.setDate(now.getDate() - 7);
      } else if (range === 'last_30_days') {
        cutoff.setDate(now.getDate() - 30);
      } else if (range === 'this_month') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (range === 'last_month') {
        cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        items = items.filter((move: any) => {
          const moveDate = new Date(move.createdAt);
          return moveDate >= cutoff && moveDate <= endOfLastMonth;
        });
      } else if (range === 'this_year') {
        cutoff = new Date(now.getFullYear(), 0, 1);
      }

      if (range !== 'last_month') {
        items = items.filter((move: any) => new Date(move.createdAt) >= cutoff);
      }
    }

    const rows = items.flatMap((move: any) =>
      (move.lines || []).map((line: any) => [
        move.reference,
        move.moveType,
        move.moveStatus,
        line.productId?.header?.name || line.productName || '',
        line.demand,
        new Date(move.createdAt).toISOString().split('T')[0],
      ]),
    );

    return {
      headers: ['Reference', 'Type', 'Status', 'Product', 'Quantity', 'Date'],
      rows,
    };
  };

  const fetchAgingReport = async () => {
    const res = await cachedFetch('/api/inventory/batch');
    const data = await res.json();
    const now = Date.now();
    const rows = (data.batches || []).map((batch: any) => {
      const ageDays = Math.floor((now - new Date(batch.manufactureDate).getTime()) / (1000 * 60 * 60 * 24));
      return [batch.batchNumber, batch.itemName, batch.quantity, ageDays, batch.status];
    });

    return {
      headers: ['Batch Number', 'Item', 'Quantity', 'Age (Days)', 'Status'],
      rows,
    };
  };

  const fetchComplianceReport = async () => {
    const res = await cachedFetch('/api/inventory/batch');
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

    return {
      headers: ['Batch Number', 'Item', 'Bonded Warehouse', 'Customs Status', 'Expiry Date'],
      rows,
    };
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedReport(null);
    try {
      let result;
      if (reportType === 'stock') {
        result = await fetchStockReport();
      } else if (reportType === 'movement') {
        result = await fetchMovementReport(dateRange);
      } else if (reportType === 'aging') {
        result = await fetchAgingReport();
      } else if (reportType === 'compliance') {
        result = await fetchComplianceReport();
      }

      if (result) {
        const selected = reportTypes.find((r) => r.value === reportType);
        setGeneratedReport({
          type: reportType,
          headers: result.headers,
          rows: result.rows,
          title: selected ? selected.label : 'Inventory Report',
        });
        toast.success('Report generated successfully!');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // After an AI-native prefill set the type/range, generate automatically (state
  // is up to date by the time this effect runs).
  useEffect(() => {
    if (!pendingGenerate) return;
    setPendingGenerate(false);
    handleGenerate();
  }, [pendingGenerate]);

  const handleExport = (format: 'csv' | 'xlsx') => {
    if (!generatedReport) return;
    const { headers, rows, title } = generatedReport;
    const filename = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const csv = [
        headers.join(','),
        ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      const worksheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Report');
      const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.xlsx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
    toast.success(`Report exported as ${format.toUpperCase()}`);
  };

  const handlePrint = () => {
    const reportContent = document.getElementById('report-content-view');
    if (!reportContent) return;

    const printWindow = window.open('', '', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${generatedReport?.title || 'Report'}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              margin: 0;
              padding: 30px;
              color: black;
            }
            .header-container {
              border-bottom: 1px solid #ddd;
              padding-bottom: 15px;
              margin-bottom: 25px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-title {
              font-size: 20px;
              font-weight: 700;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: -0.02em;
            }
            .header-subtitle {
              font-size: 11px;
              color: #666;
              margin-top: 4px;
              text-transform: uppercase;
              font-family: monospace;
            }
            .header-meta {
              text-align: right;
            }
            .header-meta-title {
              font-size: 14px;
              font-weight: 700;
              margin: 0;
            }
            .header-meta-date {
              font-size: 11px;
              color: #666;
              margin-top: 4px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            th, td {
              border-bottom: 1px solid #eee;
              padding: 12px 16px;
              text-align: left;
              font-size: 12px;
            }
            th {
              color: #555;
              font-weight: 600;
              text-transform: uppercase;
              font-family: monospace;
              font-size: 10px;
              letter-spacing: 0.1em;
            }
            .footer {
              margin-top: 40px;
              border-top: 1px solid #eee;
              padding-top: 15px;
              text-align: center;
              font-size: 9px;
              color: #bbb;
              text-transform: uppercase;
              font-family: monospace;
              letter-spacing: 0.1em;
            }
            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <h1 class="header-title">Aupulens ERP</h1>
              <div class="header-subtitle">Inventory Intelligence Report</div>
            </div>
            <div class="header-meta">
              <h2 class="header-meta-title">${generatedReport?.title}</h2>
              <div class="header-meta-date">${new Date().toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                ${generatedReport?.headers.map((h) => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${
                generatedReport?.rows.length === 0
                  ? `<tr><td colspan="${generatedReport.headers.length}" style="text-align: center; font-weight: bold; padding: 20px;">No records found</td></tr>`
                  : generatedReport?.rows
                      .map(
                        (row) =>
                          `<tr>${row
                            .map((cell, idx) => {
                              const header = generatedReport.headers[idx].toLowerCase();
                              const isCurrency = header.includes('value') || header.includes('cost');
                              const displayVal =
                                typeof cell === 'number' && isCurrency
                                  ? `₹${cell.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : cell;
                              return `<td>${displayVal}</td>`;
                            })
                            .join('')}</tr>`,
                      )
                      .join('')
              }
            </tbody>
          </table>
          <div class="footer">
            Generated by Aupulens ERP • Confidential • Internal Use Only
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
        { label: 'Reports' },
      ]}
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/inventory' })}
      profilePath="/inventory/profile"
    >
      <div className="space-y-6">
        {/* Header toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Inventory Reports
            </h1>
          </div>
          {generatedReport && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleExport('csv')}
                className="none-xl h-11 px-4 rounded-none border border-border/40 text-primary hover:bg-muted text-[13px] tracking-tight shadow-none transition-all cursor-pointer font-mono"
              >
                <Download className="mr-2 h-4 w-4 text-muted-foreground/50" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport('xlsx')}
                className="none-xl h-11 px-4 rounded-none border border-border/40 text-primary hover:bg-muted text-[13px] tracking-tight shadow-none transition-all cursor-pointer font-mono"
              >
                <Download className="mr-2 h-4 w-4 text-muted-foreground/50" />
                Export XLSX
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                className="none-xl h-11 px-4 rounded-none border border-border/40 text-primary hover:bg-muted text-[13px] tracking-tight shadow-none transition-all cursor-pointer font-mono"
              >
                <Printer className="mr-2 h-4 w-4 text-muted-foreground/50" />
                Print / PDF
              </Button>
            </div>
          )}
        </div>

        {/* Unified Card matching HR Employee structure */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Header & Controls Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="shrink-0">
                <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                  {generatedReport ? generatedReport.title : 'Report Builder'}
                </h2>
                {/* <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {generatedReport
                    ? `${generatedReport.rows.length} ${
                        generatedReport.rows.length === 1 ? 'record' : 'records'
                      } generated`
                    : 'Configure parameters to generate report'}
                </p> */}
              </div>

              {/* Toolbar Controls */}
              <div className="w-full max-w-3xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                {/* Report Type Select */}
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="h-11 w-full md:w-[210px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
                    <SelectValue placeholder="Report Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/30">
                    {reportTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="rounded-none">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Date Range Select */}
                <Select
                  value={dateRange}
                  onValueChange={setDateRange}
                  disabled={reportType !== 'movement'}
                >
                  <SelectTrigger className="h-11 w-full md:w-[210px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground disabled:opacity-40">
                    <SelectValue placeholder="Date Range" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/30">
                    {dateRanges.map((range) => (
                      <SelectItem key={range.value} value={range.value} className="rounded-none">
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Generate Button */}
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="h-11 rounded-none border border-border/20 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-mono uppercase tracking-wider px-6 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <CardContent className="p-0">
            {generatedReport ? (
              <div id="report-content-view">
                <Table>
                  <TableHeader className="border-border/40">
                    <TableRow>
                      {generatedReport.headers.map((h, idx) => (
                        <TableHead
                          key={idx}
                          className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10"
                        >
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/30">
                    {generatedReport.rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={generatedReport.headers.length}
                          className="py-24 text-center text-sm text-muted-foreground/70 font-medium"
                        >
                          No records match your parameters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      generatedReport.rows.map((row, rowIdx) => (
                        <TableRow
                          key={rowIdx}
                          className="group transition-colors duration-300 hover:bg-white/[0.015]"
                        >
                          {row.map((val, cellIdx) => {
                            const header = generatedReport.headers[cellIdx].toLowerCase();
                            const isCurrency = header.includes('value') || header.includes('cost');
                            const isCode =
                              header.includes('code') ||
                              header.includes('reference') ||
                              header.includes('batch');
                            return (
                              <TableCell
                                key={cellIdx}
                                className={`px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80 ${
                                  isCode ? 'font-mono' : ''
                                }`}
                              >
                                {typeof val === 'number' && isCurrency ? (
                                  `₹${val.toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}`
                                ) : (
                                  val
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-24 text-center">
                <BarChart className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                <h3 className="text-lg font-medium text-foreground">No report generated</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Select a report type and click generate to preview.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
