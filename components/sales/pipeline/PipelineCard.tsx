import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, ArrowRight, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Q2C_STATUS,
  Q2C_STATUS_LABELS,
  getNextQ2CStatuses,
  type Q2CStatus,
} from "@/lib/constants/statuses";
import { PipelineProgress } from "./PipelineProgress";

interface PipelineCardProps {
  order: any;
  stage: Q2CStatus;
  selectedOrder: any;
  setSelectedOrder: (val: any) => void;
  handleQ2CTransition: (orderId: string, nextStatus: string) => Promise<void>;
  formatCurrency: (val: number) => string;
}

export function PipelineCard({
  order,
  stage,
  selectedOrder,
  setSelectedOrder,
  handleQ2CTransition,
  formatCurrency,
}: PipelineCardProps) {
  const router = useRouter();
  const isSelected = selectedOrder?._id === order._id;
  const nextStatuses = getNextQ2CStatuses(stage);
  const forwardStatuses = nextStatuses.filter(
    (s) => s !== Q2C_STATUS.LOST && s !== Q2C_STATUS.CANCELLED,
  );

  return (
    <Card
      className="border border-border/30 bg-white/[0.01] hover:border-border/60 hover:bg-white/[0.02] shadow-none rounded-none transition-all duration-300 cursor-pointer"
      onClick={() => setSelectedOrder(isSelected ? null : order)}
    >
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-foreground text-sm truncate">
            {order.header.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-none hover:bg-white/5 text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/sales/quotations?view=${order._id}`);
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/75 truncate">
          {order.header.partnerId?.header?.name || "No customer"}
        </p>

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm font-bold text-foreground">
            {formatCurrency(order.totals?.amountTotal || 0)}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {new Date(order.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* Action buttons when selected */}
        {isSelected && (
          <div className="pt-3 border-t border-border/20 space-y-2">
            {/* Q2C Flow Progress */}
            <PipelineProgress currentStage={stage} />

            {/* Forward actions */}
            {forwardStatuses.map((nextSt) => (
              <Button
                key={nextSt}
                size="sm"
                className="w-full h-8 rounded-none font-mono text-[10px] bg-tertiary text-primary hover:bg-muted border border-secondary transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQ2CTransition(order._id, nextSt);
                }}
              >
                <ArrowRight className="h-3 w-3 mr-1.5" />
                {Q2C_STATUS_LABELS[nextSt]}
              </Button>
            ))}

            {/* Lost / Cancel */}
            <div className="flex gap-1.5">
              {nextStatuses.includes(Q2C_STATUS.LOST) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 rounded-none font-mono text-[10px] uppercase tracking-[0.12em] text-[#F56868] hover:text-red-700 hover:bg-[#F56868]/5 border border-border/30 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQ2CTransition(order._id, Q2C_STATUS.LOST);
                  }}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Lost
                </Button>
              )}
              {nextStatuses.includes(Q2C_STATUS.CANCELLED) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 rounded-none font-mono text-[10px] uppercase tracking-[0.12em] text-orange-400 hover:text-orange-500 hover:bg-orange-500/5 border border-border/30 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQ2CTransition(order._id, Q2C_STATUS.CANCELLED);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
