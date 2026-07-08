import { Card, CardContent } from "@/components/ui/card";

interface QuotationMetricsProps {
  data: any[];
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="border border-border/40 bg-background shadow-none rounded-none">
      <CardContent className="p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60 mb-2">
          {label}
        </p>
        <p className={`text-3xl font-bold tracking-tight text-foreground ${color || ""}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground/50 mt-1.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function QuotationMetrics({ data }: QuotationMetricsProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  const totalValue = data.reduce((sum, q) => sum + (q.totals?.amountTotal || 0), 0);
  const draftCount = data.filter((q) => q.status === "draft").length;
  const sentCount = data.filter((q) => q.status === "sent").length;
  const averageValue = data.length > 0 ? totalValue / data.length : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <SummaryCard
        label="Total Pipeline"
        value={formatCurrency(totalValue)}
        sub={`${data.length} active ${data.length === 1 ? "quotation" : "quotations"}`}
      />
      <SummaryCard
        label="Drafts"
        value={draftCount}
        color="text-muted-foreground"
        sub="awaiting review / send"
      />
      <SummaryCard
        label="Sent"
        value={sentCount}
        color="text-[#6CADF5]"
        sub="awaiting customer action"
      />
      <SummaryCard
        label="Average Value"
        value={formatCurrency(averageValue)}
        sub="per quotation proposal"
      />
    </div>
  );
}
