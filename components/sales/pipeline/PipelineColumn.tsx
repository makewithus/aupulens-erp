"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Q2C_STATUS,
  Q2C_STATUS_LABELS,
  Q2C_STATUS_COLORS,
  type Q2CStatus,
} from "@/lib/constants/statuses";
import {
  TrendingUp,
  Target,
  DollarSign,
  FileText,
  Clock,
  CheckCircle2,
  Truck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PipelineCard } from "./PipelineCard";

const VISIBLE_CAP = 5;

const Q2C_STAGE_ICONS: Record<string, any> = {
  [Q2C_STATUS.LEAD]: Target,
  [Q2C_STATUS.OPPORTUNITY]: TrendingUp,
  [Q2C_STATUS.PRICE_APPLIED]: DollarSign,
  [Q2C_STATUS.QUOTE_GENERATED]: FileText,
  [Q2C_STATUS.DISCOUNT_APPROVAL]: Clock,
  [Q2C_STATUS.QUOTE_ACCEPTED]: CheckCircle2,
  [Q2C_STATUS.SALES_ORDER]: FileText,
  [Q2C_STATUS.FULFILLMENT]: Truck,
  [Q2C_STATUS.INVOICE_POSTED]: DollarSign,
  [Q2C_STATUS.REVENUE_RECOGNIZED]: CheckCircle2,
};

interface PipelineColumnProps {
  stage: Q2CStatus;
  orders: any[];
  selectedOrder: any;
  setSelectedOrder: (val: any) => void;
  handleQ2CTransition: (orderId: string, nextStatus: string) => Promise<void>;
  formatCurrency: (val: number) => string;
}

export function PipelineColumn({
  stage,
  orders,
  selectedOrder,
  setSelectedOrder,
  handleQ2CTransition,
  formatCurrency,
}: PipelineColumnProps) {
  const colors = Q2C_STATUS_COLORS[stage] || { text: "text-foreground", bg: "bg-muted" };
  const StageIcon = Q2C_STAGE_ICONS[stage] || FileText;
  const stageTotal = orders.reduce((sum, o) => sum + (o.totals?.amountTotal || 0), 0);
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = orders.length > VISIBLE_CAP;
  const visibleOrders = expanded ? orders : orders.slice(0, VISIBLE_CAP);

  return (
    <div className="w-72 shrink-0 flex flex-col">
      {/* Stage Header */}
      <div className="border-b border-border/20 pb-3.5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-foreground font-semibold">
              {Q2C_STATUS_LABELS[stage]}
            </span>
          </div>
          <Badge
            variant="outline"
            className="rounded-none border-border/40 font-mono text-[10px] text-muted-foreground/60 bg-transparent h-5 px-1.5"
          >
            {orders.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground/50 font-mono mt-1.5">
          {formatCurrency(stageTotal)}
        </p>
      </div>

      {/* Cards list — capped at VISIBLE_CAP so a busy stage doesn't grow one
          column taller than the rest of the board; expand to scroll the rest. */}
      <div
        className={`flex-1 bg-white/[0.01] border border-border/20 rounded-none p-3 space-y-3 min-h-[450px] ${
          expanded ? "max-h-[70vh] overflow-y-auto" : ""
        }`}
      >
        {orders.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground/45 font-mono text-xs">
            No deals
          </div>
        ) : (
          visibleOrders.map((order) => (
            <PipelineCard
              key={order._id}
              order={order}
              stage={stage}
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              handleQ2CTransition={handleQ2CTransition}
              formatCurrency={formatCurrency}
            />
          ))
        )}
        {hasOverflow && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-center gap-1 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 hover:text-foreground border border-dashed border-border/30 hover:border-border/60 transition-colors"
          >
            {expanded ? (
              <>Show less <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>+{orders.length - VISIBLE_CAP} more <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
