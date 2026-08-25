import { StatCard } from "@/components/manufacturing/StatCard";
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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard
        title="Pipeline Value"
        value={formatCurrency(totalValue)}
        icon={TrendingUp}
        description="Total open pipeline"
        colorClass="text-blue-800 dark:text-blue-400"
      />
      <StatCard
        title="Active Deals"
        value={activeDeals}
        icon={Target}
        description="Currently in progress"
        colorClass="text-indigo-800 dark:text-indigo-400"
      />
      <StatCard
        title="Won"
        value={wonDeals}
        icon={CheckCircle2}
        description="Closed successfully"
        colorClass="text-emerald-800 dark:text-emerald-400"
      />
      <StatCard
        title="Lost"
        value={lostDeals}
        icon={XCircle}
        description="Closed lost"
        colorClass="text-rose-800 dark:text-rose-400"
      />
    </div>
  );
}
