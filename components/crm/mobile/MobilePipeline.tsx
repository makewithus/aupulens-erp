'use client';

import { useState } from "react";
import { MoreVertical, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function MobilePipeline() {
  const [activeStage, setActiveStage] = useState("Discovery");
  const stages = ["Discovery", "Proposal", "Negotiation", "Closed Won"];

  const deals = [
    { id: 1, name: "Acme Corp Redesign", amount: "₹45,000", stage: "Discovery", risk: true },
    { id: 2, name: "Stark Ind Licenses", amount: "₹120,000", stage: "Discovery", risk: false },
    { id: 3, name: "Wayne Ent Security", amount: "₹85,000", stage: "Proposal", risk: false },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex overflow-x-auto pb-2 px-4 gap-2 no-scrollbar shrink-0 border-b border-border bg-card pt-2">
        {stages.map(s => (
          <button 
            key={s} 
            onClick={() => setActiveStage(s)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeStage === s ? 'bg-primary text-white' : 'bg-accent text-muted-foreground'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
        {deals.filter(d => d.stage === activeStage).length === 0 ? (
          <div className="text-center text-muted-foreground text-sm mt-10">No deals in this stage.</div>
        ) : deals.filter(d => d.stage === activeStage).map(deal => (
          <div key={deal.id} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-bold text-sm text-foreground">{deal.name}</h4>
                <div className="text-primary font-mono font-semibold">{deal.amount}</div>
              </div>
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            {deal.risk && (
              <Badge variant="outline" className="bg-red-950/30 text-red-400 border-red-900/50 mt-2 text-[10px]">
                <AlertTriangle className="w-3 h-3 mr-1" /> At Risk
              </Badge>
            )}
            <div className="mt-3 flex justify-between items-center border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Next: Follow Up Call</span>
              <button className="text-xs bg-accent px-3 py-1 rounded text-foreground">Advance</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
