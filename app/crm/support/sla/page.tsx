'use client';

import { Clock, AlertOctagon, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SLACommandCenter() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clock className="w-8 h-8 text-orange-500" /> SLA Command Center
        </h1>
        <p className="text-muted-foreground mt-1">Track case compliance, average resolution times, and active breaches.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">SLA Compliance</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-sans tabular-nums text-green-400">96.4%</div>
            <p className="text-xs text-muted-foreground mt-1">Target: 95.0%</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Average Resolution Time</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-sans tabular-nums text-blue-400">4.2h</div>
            <p className="text-xs text-green-500 flex items-center gap-1 mt-1"><TrendingDown className="w-3 h-3"/> -0.5h from last week</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-red-900/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-red-400 flex items-center gap-1"><AlertOctagon className="w-4 h-4"/> Active Breaches</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-sans tabular-nums text-red-500">2</div>
            <p className="text-xs text-red-400 mt-1">Requires immediate escalation</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="bg-card border border-border p-10 text-center rounded-lg text-muted-foreground border-dashed mt-6">
        Mocked SLA data for UI demonstration.
      </div>
    </div>
  );
}
