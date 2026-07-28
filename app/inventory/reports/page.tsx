'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/shared/Table';
import { toast } from 'sonner';
import {
  ClipboardList,
  Download,
  BarChart,
  RefreshCw,
  CheckCircle2,
  Printer,
  FileText
} from 'lucide-react';
import * as xlsx from 'xlsx';

const reportTypes = [
  {
    value: 'stock',
    label: 'Stock Report',
    description: 'Complete stock summary with current quantities, unit costs, and valuations.',
    icon: ClipboardList,
    color: 'text-blue-800',
  },
  {
    value: 'movement',
    label: 'Movement Report',
    description: 'Track stock movements, inbound and outbound transactions over time.',
    icon: ClipboardList,
    color: 'text-blue-600',
  },
  {
    value: 'aging',
    label: 'Aging Report',
    description: 'Analyze stock batch age in days and identify slow-moving items.',
    icon: ClipboardList,
    color: 'text-purple-600',
  },
  {
    value: 'compliance',
    label: 'Compliance Report',
    description: 'Bonded warehouse compliance, customs status, and batch expiry tracking.',
    icon: ClipboardList,
    color: 'text-teal-600',
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

    return {
      headers: ['Product', 'Code', 'Quantity On Hand', 'Unit Cost', 'Total Value'],
      rows,
    };
  };

  const fetchMovementReport = async (range: string) => {
    const res = await fetch('/api/inventory/stock-moves');
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
    const res = await fetch('/api/inventory/batch');
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
              border-bottom: 2px solid #000;
              padding-bottom: 15px;
              margin-bottom: 25px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .header-title {
              font-size: 24px;
              font-weight: 900;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: -0.05em;
            }
            .header-subtitle {
              font-size: 12px;
              font-weight: 700;
              color: #666;
              margin-top: 4px;
              text-transform: uppercase;
            }
            .header-meta {
              text-align: right;
            }
            .header-meta-title {
              font-size: 16px;
              font-weight: 900;
              margin: 0;
            }
            .header-meta-date {
              font-size: 12px;
              color: #666;
              margin-top: 4px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            th, td {
              border: 1px solid #000;
              padding: 10px 12px;
              text-align: left;
              font-size: 12px;
            }
            th {
              background-color: #f3f4f6;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            tr:nth-child(even) {
              background-color: #fafafa;
            }
            .footer {
              margin-top: 30px;
              border-top: 1px solid #ddd;
              padding-top: 10px;
              text-align: center;
              font-size: 10px;
              color: #999;
              text-transform: uppercase;
              font-weight: 700;
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

  const selectedReport = reportTypes.find((r) => r.value === reportType);

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
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">
            Inventory Reports
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <Card className="none-4xl border-2 shadow-xl bg-card">
            <div className="p-6 border-b-2 bg-muted/30">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-card-foreground">
                    Report Configuration
                  </h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                    Select parameters to generate
                  </p>
                </div>
              </div>
            </div>
            <CardContent className="p-6 space-y-6">
              {/* Report Type */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Report Type
                </label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="none-xl h-12 border-2 font-bold rounded-none bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {reportTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="rounded-none">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Date Range
                </label>
                <Select
                  value={dateRange}
                  onValueChange={setDateRange}
                  disabled={reportType !== 'movement'}
                >
                  <SelectTrigger className="none-xl h-12 border-2 font-bold rounded-none bg-background text-foreground disabled:opacity-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {dateRanges.map((range) => (
                      <SelectItem key={range.value} value={range.value} className="rounded-none">
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reportType !== 'movement' && (
                  <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-55">
                    Current snapshot only — date range disabled
                  </p>
                )}
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full none-xl h-12 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 rounded-none cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Generate Report
                  </>
                )}
              </Button>

              {/* Report Info */}
              {selectedReport && (
                <div className="p-4 none-xl bg-muted/30 border-2 border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <selectedReport.icon className={`h-5 w-5 ${selectedReport.color}`} />
                    <p className="text-sm font-black uppercase text-card-foreground">
                      {selectedReport.label}
                    </p>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    {selectedReport.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview Area */}
          <div className="lg:col-span-2">
            {generatedReport ? (
              <div className="space-y-4">
                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 justify-between items-center print:hidden">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleExport('csv')}
                      className="none-xl h-10 font-black uppercase text-xs rounded-none border-2 border-primary/20 hover:border-primary/50 text-foreground cursor-pointer"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleExport('xlsx')}
                      className="none-xl h-10 font-black uppercase text-xs rounded-none border-2 border-primary/20 hover:border-primary/50 text-foreground cursor-pointer"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export XLSX
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePrint}
                      className="none-xl h-10 font-black uppercase text-xs rounded-none border-2 border-primary/20 hover:border-primary/50 text-foreground cursor-pointer"
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Print / PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setGeneratedReport(null)}
                      className="none-xl h-10 font-black uppercase text-xs text-destructive hover:bg-destructive/10 rounded-none border-2 border-destructive/20 hover:border-destructive/50 cursor-pointer"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reset
                    </Button>
                  </div>
                </div>

                {/* Printable and Viewable Report Card */}
                <div id="report-content-view">
                  <Card className="none-4xl border-2 shadow-xl bg-card text-card-foreground print:shadow-none print:border-0 rounded-none">
                    <div className="p-6 border-b-2 border-border print:pb-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">
                            Aupulens ERP
                          </h1>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">
                            Inventory Intelligence Report
                          </p>
                        </div>
                        <div className="text-right">
                          <h2 className="text-lg font-black text-foreground uppercase">
                            {generatedReport.title}
                          </h2>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase mt-1">
                            {new Date().toLocaleDateString('en-IN', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>

                    <CardContent className="p-0 overflow-x-auto">
                      <TableContainer className="border-0">
                        <TableHead className="bg-muted/40 border-b-2 border-border text-foreground">
                          <TableRow>
                            {generatedReport.headers.map((h, idx) => (
                              <TableHeaderCell
                                key={idx}
                                className="font-black text-foreground py-4 px-6 border-r last:border-0 border-border text-left"
                              >
                                {h}
                              </TableHeaderCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody className="divide-y divide-border/40">
                          {generatedReport.rows.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={generatedReport.headers.length}
                                className="text-center font-bold text-muted-foreground py-8"
                              >
                                No records found
                              </TableCell>
                            </TableRow>
                          ) : (
                            generatedReport.rows.map((row, rowIdx) => (
                              <TableRow key={rowIdx} className="hover:bg-muted/10 transition-colors">
                                {row.map((val, cellIdx) => {
                                  const header = generatedReport.headers[cellIdx].toLowerCase();
                                  const isCurrency = header.includes('value') || header.includes('cost');
                                  return (
                                    <TableCell
                                      key={cellIdx}
                                      className="py-4 px-6 border-r last:border-0 border-border text-left text-sm text-foreground/80"
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
                      </TableContainer>
                    </CardContent>

                    <div className="px-6 py-4 border-t border-border bg-muted/10 print:bg-transparent">
                      <p className="text-center text-[10px] text-muted-foreground/60 font-bold uppercase tracking-wider">
                        Generated by Aupulens ERP • Confidential • Internal Use Only
                      </p>
                    </div>
                  </Card>
                </div>
              </div>
            ) : (
              <Card className="none-4xl border-2 border-dashed h-full min-h-[500px] flex flex-col items-center justify-center text-center rounded-none bg-card">
                <BarChart className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-black uppercase tracking-tight text-muted-foreground mb-1">
                  No Report Generated
                </h3>
                <p className="text-xs font-bold text-muted-foreground/60 uppercase">
                  Select parameters and click generate
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
