'use client';

import { Sparkles, CheckCircle, AlertTriangle, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ConversationSummaryCardProps {
  summary: {
    summary: string;
    keyDecisions: string[];
    risks: string[];
    followUps: string[];
    actionItems: string[];
    sentiment: string;
  };
}

export default function ConversationSummaryCard({ summary }: ConversationSummaryCardProps) {
  if (!summary) return null;

  return (
    <div className="bg-indigo-950/20 border border-indigo-900/50 rounded-lg p-5 mt-4">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> AI Conversation Intelligence
        </h3>
        <Badge variant="outline" className={`text-xs ${
          summary.sentiment === "Positive" ? "text-green-400 border-green-900/50" : 
          summary.sentiment === "Negative" ? "text-red-400 border-red-900/50" : 
          "text-muted-foreground border-border"
        }`}>{summary.sentiment}</Badge>
      </div>

      <p className="text-sm text-foreground mb-4">{summary.summary}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {summary.actionItems.length > 0 && (
          <div>
            <h4 className="font-semibold text-muted-foreground mb-2 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Action Items</h4>
            <ul className="list-disc pl-4 text-foreground space-y-1">
              {summary.actionItems.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
        {summary.risks.length > 0 && (
          <div>
            <h4 className="font-semibold text-muted-foreground mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-400"/> Identified Risks</h4>
            <ul className="list-disc pl-4 text-foreground space-y-1">
              {summary.risks.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
        {summary.keyDecisions.length > 0 && (
          <div>
            <h4 className="font-semibold text-muted-foreground mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3"/> Key Decisions</h4>
            <ul className="list-disc pl-4 text-foreground space-y-1">
              {summary.keyDecisions.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
