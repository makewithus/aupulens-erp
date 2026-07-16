import { StatCard } from "@/components/admin/StatCard";
import { TrendingUp, Target, CheckCircle2, XCircle } from "lucide-react";

interface PipelineStatsProps {
  totalValue: number;
  activeDeals: number;
  wonDeals: number;
  lostDeals: number;
}

export function PipelineStats({
  totalValue,
  activeDeals,
  wonDeals,
  lostDeals,
}: PipelineStatsProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
      <StatCard
        title="Pipeline Value"
        value={formatCurrency(totalValue)}
        className="border border-border/40 bg-background shadow-none rounded-none"
      />
      <StatCard
        title="Active Deals"
        value={activeDeals} 
        className="border border-border/40 bg-background shadow-none rounded-none"
      />
      <StatCard
        title="Won"
        value={wonDeals}
        className="border border-border/40 bg-background shadow-none rounded-none"
      />
      <StatCard
        title="Lost"
        value={lostDeals}
        className="border border-border/40 bg-background shadow-none rounded-none"
      />
    </div>
  );
}
