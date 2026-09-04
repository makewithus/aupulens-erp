import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, RotateCcw } from "lucide-react";
import { Q2C_STATUS } from "@/lib/constants/statuses";

interface LostDealsProps {
  orders: any[];
  handleQ2CTransition: (orderId: string, nextStatus: string) => Promise<void>;
  formatCurrency: (val: number) => string;
}

export function LostDeals({
  orders,
  handleQ2CTransition,
  formatCurrency,
}: LostDealsProps) {
  if (!orders || orders.length === 0) return null;

  return (
    <Card className="border border-border/40 bg-background shadow-none rounded-none">
      <CardHeader className="pb-3.5 border-b border-border/20 px-6 py-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-[#F56868]" />
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-[#F56868]">
              Lost Deals
            </span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground/60">
            <span className="font-sans tabular-nums">{orders.length}</span> {orders.length === 1 ? "Deal" : "Deals"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-3">
        {orders.map((order) => (
          <div
            key={order._id}
            className="flex items-center justify-between p-4 border border-border/20 bg-white/[0.01] hover:border-border/40 transition-all duration-300"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">
                {order.header.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {order.header.partnerId?.header?.name || "Unknown"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-foreground">
                {formatCurrency(order.totals?.amountTotal || 0)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 rounded-none font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300 gap-1.5"
                onClick={() => handleQ2CTransition(order._id, Q2C_STATUS.LEAD)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-open
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
