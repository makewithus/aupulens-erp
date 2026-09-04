'use client';

import { useState, useEffect } from "react";
import { Sparkles, AlertTriangle, Lightbulb, UserCheck, Activity } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/ai/insights")
      .then(res => res.json())
      .then(data => {
        if (data.success) setInsights(data.data);
        setLoading(false);
      });
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case "Risk": return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case "Recommendation": return <Lightbulb className="w-4 h-4 text-yellow-400" />;
      case "Duplicate": return <UserCheck className="w-4 h-4 text-blue-400" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-400" />
          AI Intelligence Inbox
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review system-generated insights, deal risks, and Next Best Action recommendations.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground">Insight</TableHead>
              <TableHead className="text-muted-foreground">Entity</TableHead>
              <TableHead className="text-muted-foreground">Severity</TableHead>
              <TableHead className="text-muted-foreground">Confidence</TableHead>
              <TableHead className="text-muted-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Running AI Analysis...</TableCell></TableRow>
            ) : insights.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground border border-dashed border-border">No active insights. System is optimal.</TableCell></TableRow>
            ) : insights.map(insight => (
              <TableRow key={insight._id} className="border-border hover:bg-accent/50 text-sm">
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getIcon(insight.insightType)} <span>{insight.insightType}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-semibold text-foreground">{insight.title}</div>
                  <div className="text-xs text-muted-foreground">{insight.description}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="bg-accent">{insight.entityType}</Badge></TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${
                    insight.severity === 'Critical' ? 'border-red-900/50 text-red-400' :
                    insight.severity === 'High' ? 'border-orange-900/50 text-orange-400' : ''
                  }`}>{insight.severity}</Badge>
                </TableCell>
                <TableCell className="font-sans tabular-nums text-xs">{insight.confidence}%</TableCell>
                <TableCell className="text-indigo-400 text-xs font-semibold cursor-pointer hover:underline">
                  {insight.recommendedAction || "Review"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
