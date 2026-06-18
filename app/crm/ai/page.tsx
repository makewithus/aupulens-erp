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
      default: return <Activity className="w-4 h-4 text-neutral-400" />;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-400" />
          AI Intelligence Inbox
        </h1>
        <p className="text-sm text-neutral-400 mt-1">
          Review system-generated insights, deal risks, and Next Best Action recommendations.
        </p>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-neutral-800 hover:bg-transparent">
              <TableHead className="text-neutral-400">Type</TableHead>
              <TableHead className="text-neutral-400">Insight</TableHead>
              <TableHead className="text-neutral-400">Entity</TableHead>
              <TableHead className="text-neutral-400">Severity</TableHead>
              <TableHead className="text-neutral-400">Confidence</TableHead>
              <TableHead className="text-neutral-400">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-neutral-500">Running AI Analysis...</TableCell></TableRow>
            ) : insights.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-neutral-500 border border-dashed border-neutral-800">No active insights. System is optimal.</TableCell></TableRow>
            ) : insights.map(insight => (
              <TableRow key={insight._id} className="border-neutral-800 hover:bg-neutral-800/50 text-sm">
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getIcon(insight.insightType)} <span>{insight.insightType}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-semibold text-neutral-200">{insight.title}</div>
                  <div className="text-xs text-neutral-500">{insight.description}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="bg-neutral-800">{insight.entityType}</Badge></TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${
                    insight.severity === 'Critical' ? 'border-red-900/50 text-red-400' :
                    insight.severity === 'High' ? 'border-orange-900/50 text-orange-400' : ''
                  }`}>{insight.severity}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{insight.confidence}%</TableCell>
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
