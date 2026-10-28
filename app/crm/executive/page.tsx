'use client';

import { useState, useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { TrendingUp, BarChart3, AlertCircle, ShieldAlert, Target, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ExecutiveCommandCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cachedFetch("/api/crm/dashboard/summary", undefined, { force: true })
      .then((r) => r.json())
      .then((r) => r.success && setData(r.data.executive))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10 text-center text-muted-foreground">Compiling enterprise analytics...</div>;
  const money = (value: number | undefined) => value == null ? "—" : `₹${(value / 100000).toFixed(2)} L`;
  const percent = (value: number | null | undefined) => value == null ? "—" : `${value}%`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Target className="w-8 h-8 text-blue-500" /> Executive Command Center
        </h1>
        <p className="text-muted-foreground mt-1">Real-time revenue intelligence, forecast accuracy, and enterprise health.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Current Quarter Forecast</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-sans tabular-nums font-bold text-green-400">{money(data?.weightedForecast)}</div>
            <p className="text-xs text-muted-foreground mt-1">Annual weighted forecast: {money(data?.annualWeightedForecast)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Coverage</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-sans tabular-nums font-bold">{money(data?.pipelineValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Open pipeline value</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Retention Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-sans tabular-nums font-bold text-blue-400">{percent(data?.retentionRate)}</div>
            <p className="text-xs text-muted-foreground mt-1">Renewed contracts / resolved renewals</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Data Governance</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-sans tabular-nums font-bold">{percent(data?.winRate)}</div>
            <p className="text-xs text-muted-foreground mt-1">Opportunity win rate</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border-border h-80 flex flex-col items-center justify-center">
          <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-muted-foreground font-medium">Revenue Trend vs Forecast</h3>
          <p className="text-xs text-muted-foreground">Historical plotting goes here</p>
        </Card>
        <Card className="bg-card border-border h-80 flex flex-col items-center justify-center">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-muted-foreground font-medium">Top Deal Risks & Competitor Threats</h3>
          <p className="text-xs text-muted-foreground">Aggregated from DealLossAnalytics</p>
        </Card>
      </div>
    </div>
  );
}
