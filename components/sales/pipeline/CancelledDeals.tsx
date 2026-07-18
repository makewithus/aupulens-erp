import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle } from "lucide-react";

interface CancelledDealsProps {
  orders: any[];
  formatCurrency: (val: number) => string;
}

export function CancelledDeals({
  orders,
  formatCurrency,
}: CancelledDealsProps) {
  if (!orders || orders.length === 0) return null;

  return (
    <Card className="border border-border/40 bg-background shadow-none rounded-none">
      <CardHeader className="pb-3.5 border-b border-border/20 px-6 py-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-muted-foreground/60" />
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground/60">
              Cancelled Deals
            </span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground/60">
            {orders.length} {orders.length === 1 ? "Deal" : "Deals"}
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
            <span className="text-sm font-bold text-foreground">
              {formatCurrency(order.totals?.amountTotal || 0)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
