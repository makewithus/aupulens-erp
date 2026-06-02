import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrendingUp, LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color: string; // expects "text-color bg-color" string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color,
}: StatCardProps) {
  const iconClass =
    color.split(" ").find((c) => c.startsWith("text-")) || "text-primary";
  const bgClass =
    color.split(" ").find((c) => c.startsWith("bg-")) || "bg-primary";

  return (
    <Card className="border-none shadow-md bg-card relative overflow-hidden group">
      <div
        className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity ${bgClass}`}
      >
        <Icon className="w-24 h-24" />
      </div>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${iconClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {trend && (
            <span className="text-green-500 inline-flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> {trend}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
