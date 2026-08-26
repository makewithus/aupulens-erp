import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";

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
        visual={<UsersGraph />}
        subtitle="Total open pipeline"
      />
      <StatCard
        title="Active Deals"
        value={activeDeals}
        visual={<ActivePulse />}
        subtitle="Currently in progress"
      />
      <StatCard
        title="Won"
        value={wonDeals}
        visual={<UsersGraph />}
        subtitle="Closed successfully"
      />
      <StatCard
        title="Lost"
        value={lostDeals}
        visual={<InactiveOrbit />}
        subtitle="Closed lost"
      />
    </div>
  );
}
