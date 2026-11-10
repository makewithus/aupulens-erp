'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DailyBrickBarChart } from '@/components/charts/DailyBrickBarChart';
import { TradingLineChart } from '@/components/charts/TradingLineChart';

import { useThemeStore } from '@/store/themeStore';
import { cn } from '@/lib/utils';

interface VisualizationDataPoint {
  date?: string;
  name?: string;
  value?: number;
  revenue?: number;
  expenses?: number;
  debit?: number;
  credit?: number;
  inflow?: number;
  outflow?: number;
  net?: number;
  [key: string]: string | number | undefined;
}

interface FinanceVisualizationProps {
  availableDataTypes: Array<{ value: string; label: string }>;
  defaultDataType?: string;
  defaultChartType?: 'bar' | 'line' | 'pie';
  title?: string;
  className?: string;
}

const COLORS = [
  '#A77DFF', // Brand Purple
  '#8AE06C', // Brand Green
  '#6CADF5', // Brand Blue
  '#F1DF38', // Brand Yellow
  '#F56868', // Brand Red
  '#757575', // Brand Grey
  '#B595FF', // Lavender
  '#88C2FF', // Light Blue
];

export function FinanceVisualization({
  availableDataTypes,
  defaultDataType,
  defaultChartType = 'bar',
  title = 'Data Visualization',
  className = '',
}: FinanceVisualizationProps) {
  const { theme } = useThemeStore();
  const isDark = theme !== 'light';

  const [selectedDataType, setSelectedDataType] = useState(defaultDataType || availableDataTypes[0]?.value || '');
  const [selectedChartType, setSelectedChartType] = useState<'bar' | 'line' | 'pie'>(defaultChartType);
  const [dateRange, setDateRange] = useState('30');
  const [groupBy, setGroupBy] = useState('day');

  const [visualizationData, setVisualizationData] = useState<VisualizationDataPoint[]>([]);
  const [isLoadingViz, setIsLoadingViz] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchVisualizationData = useCallback(async () => {
    if (!selectedDataType) return;
    
    try {
      setIsLoadingViz(true);
      setFetchError(null);
      setVisualizationData([]);
      const res = await fetch(
        `/api/finance/visualization?type=${selectedDataType}&dateRange=${dateRange}&groupBy=${groupBy}`
      );
      if (!res.ok) throw new Error('Failed to fetch visualization data');

      const result = await res.json();
      const rows = Array.isArray(result.data) ? result.data : [];
      setVisualizationData(rows.map((row: VisualizationDataPoint) => ({
        ...row,
        value: Number(row.value ?? row.revenue ?? row.debit ?? row.inflow ?? 0),
      })));
    } catch (err) {
      console.error('Finance visualization request failed:', err);
      setVisualizationData([]);
      setFetchError('Unable to load finance analytics. Please refresh to try again.');
    } finally {
      setIsLoadingViz(false);
    }
  }, [selectedDataType, dateRange, groupBy]);

  useEffect(() => {
    fetchVisualizationData();
  }, [fetchVisualizationData]);

  const isPieChartData = selectedDataType.includes('breakdown') || 
                         selectedDataType.includes('status') ||
                         selectedDataType.includes('receivables-payables');

  const isTimeSeriesData = !isPieChartData;

  const displayData = visualizationData;

  return (
    <Card className={cn(
      "chart-animate-in chart-shimmer-border border font-mono transition-colors duration-200",
      isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2] shadow-md" : "bg-white border-[#e5e5e5] text-slate-900 shadow-sm",
      className
    )}>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-foreground/70" />
            {title}
          </CardTitle>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Data Type Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground dark:text-foreground">
              Data to Visualize
            </label>
            <Select value={selectedDataType} onValueChange={setSelectedDataType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableDataTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chart Type Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground dark:text-foreground">
              Chart Type
            </label>
            <Select 
              value={selectedChartType} 
              onValueChange={(value) => setSelectedChartType(value as 'bar' | 'line' | 'pie')}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Bar Chart (Discrete Bricks)
                  </div>
                </SelectItem>
                {isTimeSeriesData && (
                  <SelectItem value="line">
                    <div className="flex items-center gap-2">
                      <LineChartIcon className="h-4 w-4" />
                      Line Chart (Binance Style)
                    </div>
                  </SelectItem>
                )}
                {isPieChartData && (
                  <SelectItem value="pie">
                    <div className="flex items-center gap-2">
                      <PieChartIcon className="h-4 w-4" />
                      Pie Chart
                    </div>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground dark:text-foreground">
              Date Range
            </label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
                <SelectItem value="180">Last 6 Months</SelectItem>
                <SelectItem value="365">Last Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Group By Selector */}
          {isTimeSeriesData && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground dark:text-foreground">
                Group By
              </label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoadingViz ? (
          <div className="flex justify-center items-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-foreground/70" />
          </div>
        ) : fetchError ? (
          <div role="alert" className="flex h-96 items-center justify-center text-sm text-destructive">{fetchError}</div>
        ) : displayData.length === 0 ? (
          <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">No recorded data is available for this selection.</div>
        ) : (
          <div className="w-full">
            {selectedChartType === 'pie' ? (
              <div style={{ height: '384px' }}>
                <ResponsiveContainer width="100%" height={384} minWidth={300} minHeight={384}>
                  <PieChart>
                    <Pie
                      data={displayData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={(entry: Record<string, unknown>) => {
                        const name = entry.name as string || 'Unknown';
                        const percent = typeof entry.percent === 'number' ? entry.percent : 0;
                        return `${name}: ${(percent * 100).toFixed(1)}%`;
                      }}
                      outerRadius={140}
                      innerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                      paddingAngle={2}
                      isAnimationActive={true}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    >
                      {displayData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`}
                      contentStyle={{ 
                        backgroundColor: isDark ? '#161616' : '#ffffff',
                        borderColor: isDark ? '#272727' : '#e5e5e5',
                        color: isDark ? '#F2F2F2' : '#0f172a',
                        borderRadius: '0px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : selectedChartType === 'line' ? (
              <div className="w-full min-h-[440px]">
                <TradingLineChart
                  data={displayData}
                  valueKey="value"
                  dateKey={isPieChartData ? "name" : "date"}
                  metricLabel="Amount"
                  title={title}
                  currencyPrefix="₹"
                  height={440}
                  colorTheme="white"
                  isDark={isDark}
                />
              </div>
            ) : (
              <div className="w-full min-h-[340px]">
                <DailyBrickBarChart
                  data={displayData}
                  dateKey={isPieChartData ? "name" : "date"}
                  valueKey="value"
                  metricLabel="Amount"
                  colorTheme="purple"
                  isDark={isDark}
                  yAxisFormatter={(v) => "₹" + (v >= 100000 ? (v / 100000).toFixed(1) + "L" : v >= 1000 ? (v / 1000).toFixed(0) + "K" : v)}
                  tooltipValueFormatter={(v) => "₹" + v.toLocaleString("en-IN")}
                  height={340}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
