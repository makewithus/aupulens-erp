'use client';

import { useState, useEffect } from "react";
import { TrendingUp, BarChart3, AlertCircle, ShieldAlert, Target, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ExecutiveCommandCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a full implementation, this calls an aggregate API leveraging the engines
    setTimeout(() => {
      setData({
        forecast: { best: 1200000, likely: 850000, worst: 450000, accuracy: 92 },
        pipeline: { coverage: 3.2, gap: 0 },
        retention: { rate: 94, churnRiskTotal: 120000 },
        governance: { score: 88, orphans: 12 }
      });
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) return <div className="p-10 text-center text-neutral-500">Compiling enterprise analytics...</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Target className="w-8 h-8 text-blue-500" /> Executive Command Center
        </h1>
        <p className="text-neutral-400 mt-1">Real-time revenue intelligence, forecast accuracy, and enterprise health.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-400">Likely Forecast (Q3)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">${data.forecast.likely.toLocaleString()}</div>
            <p className="text-xs text-neutral-500 mt-1">Best Case: ${data.forecast.best.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-400">Pipeline Coverage</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.pipeline.coverage}x</div>
            <p className="text-xs text-green-500 mt-1">Healthy target achieved</p>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-400">Retention Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{data.retention.rate}%</div>
            <p className="text-xs text-red-400 mt-1">${data.retention.churnRiskTotal.toLocaleString()} At Risk</p>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-400">Data Governance</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.governance.score}/100</div>
            <p className="text-xs text-yellow-500 mt-1">{data.governance.orphans} Orphan Records</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-neutral-900 border-neutral-800 h-80 flex flex-col items-center justify-center">
          <BarChart3 className="w-12 h-12 text-neutral-700 mb-4" />
          <h3 className="text-neutral-400 font-medium">Revenue Trend vs Forecast</h3>
          <p className="text-xs text-neutral-500">Historical plotting goes here</p>
        </Card>
        <Card className="bg-neutral-900 border-neutral-800 h-80 flex flex-col items-center justify-center">
          <ShieldAlert className="w-12 h-12 text-neutral-700 mb-4" />
          <h3 className="text-neutral-400 font-medium">Top Deal Risks & Competitor Threats</h3>
          <p className="text-xs text-neutral-500">Aggregated from DealLossAnalytics</p>
        </Card>
      </div>
    </div>
  );
}
