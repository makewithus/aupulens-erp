'use client';

import React from "react";
import { 
  Megaphone, UserPlus, Target, FileText, FileCheck, ArrowRight, CheckCircle2 
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export interface JourneyStage {
  type: "Campaign" | "Lead" | "Opportunity" | "Quote" | "Contract";
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  date?: string;
  amount?: number;
}

interface CustomerJourneyProps {
  stages: JourneyStage[];
}

const STAGE_CONFIG = {
  Campaign: { icon: Megaphone, color: "text-purple-400", bg: "bg-purple-900/20", border: "border-purple-900/50", route: "/crm/campaigns" },
  Lead: { icon: UserPlus, color: "text-blue-400", bg: "bg-blue-900/20", border: "border-blue-900/50", route: "/crm/leads" },
  Opportunity: { icon: Target, color: "text-yellow-400", bg: "bg-yellow-900/20", border: "border-yellow-900/50", route: "/crm/opportunities" },
  Quote: { icon: FileText, color: "text-orange-400", bg: "bg-orange-900/20", border: "border-orange-900/50", route: "/crm/quotes" },
  Contract: { icon: FileCheck, color: "text-green-400", bg: "bg-green-900/20", border: "border-green-900/50", route: "/crm/contracts" },
};

export default function CustomerJourney({ stages }: CustomerJourneyProps) {
  if (!stages || stages.length === 0) {
    return <div className="p-6 text-center text-muted-foreground border border-dashed border-border rounded-lg">No journey data available.</div>;
  }

  return (
    <div className="relative py-4">
      {/* Background connecting line */}
      <div className="absolute left-6 top-8 bottom-8 w-px bg-accent" />

      <div className="space-y-6">
        {stages.map((stage, idx) => {
          const config = STAGE_CONFIG[stage.type];
          const Icon = config.icon;
          const isLast = idx === stages.length - 1;

          return (
            <div key={`${stage.type}-${stage.id}`} className="relative flex items-start gap-4">
              {/* Connector dot/icon */}
              <div className={`relative z-10 flex shrink-0 items-center justify-center w-12 h-12 rounded-full border ${config.border} ${config.bg}`}>
                <Icon className={`w-5 h-5 ${config.color}`} />
              </div>

              {/* Content card */}
              <div className="flex-1 min-w-0">
                <Link href={`${config.route}/${stage.id}`} className="block group">
                  <div className="bg-card border border-border rounded-lg p-4 transition-colors group-hover:border-border">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold uppercase tracking-wider ${config.color}`}>
                            {stage.type}
                          </span>
                          {stage.status && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border text-muted-foreground">
                              {stage.status}
                            </Badge>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {stage.title}
                        </h4>
                        {stage.subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{stage.subtitle}</p>
                        )}
                      </div>
                      
                      <div className="text-right shrink-0">
                        {stage.amount !== undefined && (
                          <div className="font-mono font-medium text-sm text-green-400">
                            ${stage.amount.toLocaleString()}
                          </div>
                        )}
                        {stage.date && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(stage.date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
                {!isLast && (
                  <div className="mt-4 ml-6 flex items-center text-muted-foreground">
                    <ArrowRight className="w-4 h-4 mr-2" />
                    <span className="text-xs font-medium uppercase tracking-wider">Converted To</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
