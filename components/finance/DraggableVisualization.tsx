'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Maximize2, Minimize2, BarChart3, LineChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { DailyBrickBarChart } from '@/components/charts/DailyBrickBarChart';
import { TradingLineChart } from '@/components/charts/TradingLineChart';

interface DraggableVisualizationProps {
  isOpen: boolean;
  onClose: () => void;
  data: Record<string, string | number>[];
  title: string;
  chartType?: 'bar' | 'line';
  xAxisKey?: string;
  dataKeys?: {
    key: string;
    name: string;
    color: string;
  }[];
}

export function DraggableVisualization({
  isOpen,
  onClose,
  data,
  title,
  chartType = 'bar',
  xAxisKey = 'date',
  dataKeys = [],
}: DraggableVisualizationProps) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
      if (isResizing) {
        const newWidth = Math.max(400, resizeStart.width + (e.clientX - resizeStart.x));
        const newHeight = Math.max(300, resizeStart.height + (e.clientY - resizeStart.y));
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart]);

  const handleDragStart = (e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    });
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed bg-background border-2 border-border rounded-none shadow-2xl z-50 flex flex-col overflow-hidden',
        'transition-all duration-200',
        isDragging && 'select-none cursor-move',
        isResizing && 'select-none',
        isMaximized && 'inset-4'
      )}
      style={
        isMaximized
          ? undefined
          : {
              left: position.x,
              top: position.y,
              width: size.width,
              height: size.height,
              userSelect: (isDragging || isResizing) ? 'none' : 'auto',
            }
      }
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border select-none',
          !isMaximized && 'cursor-move'
        )}
        onMouseDown={handleDragStart}
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-none bg-primary/10">
            {chartType === 'bar' ? (
              <BarChart3 className="h-4 w-4 text-primary" />
            ) : (
              <LineChart className="h-4 w-4 text-primary" />
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-accent"
            onClick={toggleMaximize}
          >
            {isMaximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto bg-background flex flex-col justify-center" style={{ minHeight: '320px' }}>
        {chartType === 'bar' ? (
          <div className="w-full h-full min-h-[300px]">
            <DailyBrickBarChart
              data={data && data.length > 0 ? (data as any) : undefined}
              dateKey={xAxisKey}
              valueKey={dataKeys[0]?.key || 'value'}
              metricLabel={dataKeys[0]?.name || 'Amount'}
              yAxisFormatter={(v) => '₹' + v.toLocaleString('en-IN')}
              tooltipValueFormatter={(v) => '₹' + v.toLocaleString('en-IN')}
              seedDemonstration={!data || data.length === 0}
              height="100%"
            />
          </div>
        ) : (
          <div className="w-full h-full min-h-[320px]">
            <TradingLineChart
              data={data && data.length > 0 ? data : undefined}
              valueKey={dataKeys[0]?.key || 'value'}
              dateKey={xAxisKey}
              metricLabel={dataKeys[0]?.name || 'Amount'}
              title={title}
              currencyPrefix="₹"
              height="100%"
            />
          </div>
        )}
      </div>

      {/* Resize Handle */}
      {!isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group"
          onMouseDown={handleResizeStart}
        >
          <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted-foreground/40 group-hover:border-primary transition-colors" />
        </div>
      )}
    </div>
  );
}
