'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

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
  '#10b981', '#64748b', '#3b82f6', 
  '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316'
];

export function FinanceVisualization({
  availableDataTypes,
  defaultDataType,
  defaultChartType = 'bar',
  title = 'Data Visualization',
  className = '',
}: FinanceVisualizationProps) {
  const [visualizationData, setVisualizationData] = useState<VisualizationDataPoint[]>([]);
  const [isLoadingViz, setIsLoadingViz] = useState(false);
  const [selectedDataType, setSelectedDataType] = useState(defaultDataType || availableDataTypes[0]?.value || '');
  const [selectedChartType, setSelectedChartType] = useState<'bar' | 'line' | 'pie'>(defaultChartType);
  const [dateRange, setDateRange] = useState('30');
  const [groupBy, setGroupBy] = useState('day');

  const fetchVisualizationData = useCallback(async () => {
    if (!selectedDataType) return;
    
    try {
      setIsLoadingViz(true);
      const res = await fetch(
        `/api/finance/visualization?type=${selectedDataType}&dateRange=${dateRange}&groupBy=${groupBy}`
      );
      if (!res.ok) throw new Error('Failed to fetch visualization data');

      const result = await res.json();
      setVisualizationData(result.data || []);
    } catch (err) {
      console.error('Error fetching visualization:', err);
      setVisualizationData([]);
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

  return (
    <Card className={`border-2 border-slate-200 dark:border-slate-700 ${className}`}>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
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
                    Bar Chart
                  </div>
                </SelectItem>
                {isTimeSeriesData && (
                  <SelectItem value="line">
                    <div className="flex items-center gap-2">
                      <LineChartIcon className="h-4 w-4" />
                      Line Chart
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
            <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
          </div>
        ) : visualizationData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-muted-foreground dark:text-muted-foreground">
            <BarChart3 className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No data available</p>
            <p className="text-sm">Try adjusting the filters or add some data</p>
          </div>
        ) : (
          <div className="w-full" style={{ height: '384px', minHeight: '384px' }}>
            <ResponsiveContainer width="100%" height={384} minWidth={300} minHeight={384} key={`${selectedDataType}-${selectedChartType}-${dateRange}`}>
              {selectedChartType === 'pie' ? (
                <PieChart>
                  <Pie
                    data={visualizationData}
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
                  >
                    {visualizationData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`}
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                </PieChart>
              ) : selectedChartType === 'line' ? (
                <LineChart data={visualizationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`}
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  {Object.keys(visualizationData[0] || {})
                    .filter(key => key !== 'date' && key !== 'name')
                    .map((key, index) => (
                      <Line 
                        key={key}
                        type="monotone" 
                        dataKey={key} 
                        stroke={COLORS[index % COLORS.length]} 
                        strokeWidth={2}
                        name={key.charAt(0).toUpperCase() + key.slice(1)}
                      />
                    ))}
                </LineChart>
              ) : (
                <BarChart data={visualizationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey={isPieChartData ? "name" : "date"} 
                    angle={isPieChartData ? -45 : 0} 
                    textAnchor={isPieChartData ? "end" : "middle"}
                    height={isPieChartData ? 100 : 30}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`}
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  {isPieChartData ? (
                    <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
                  ) : (
                    Object.keys(visualizationData[0] || {})
                      .filter(key => key !== 'date' && key !== 'name')
                      .map((key, index) => (
                        <Bar 
                          key={key}
                          dataKey={key} 
                          fill={COLORS[index % COLORS.length]} 
                          radius={[8, 8, 0, 0]}
                          name={key.charAt(0).toUpperCase() + key.slice(1)}
                        />
                      ))
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
