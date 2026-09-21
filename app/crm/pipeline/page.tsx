'use client';
import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";
import { ChevronDown, ChevronUp } from "lucide-react";

const STAGES = ['Prospecting','Discovery','Requirement Gathering','Solution Fit','Proposal Sent','Negotiation','Approval', 'Closed Won', 'Closed Lost'];
const PAGE_SIZE = 5;

// Indian-style compact amounts (₹40.73 Cr / ₹12.50 L) so large pipeline values
// stay on one line and never show stray decimals like "₹407,323,390.2".
function formatInrCompact(n: number) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export default function PipelinePage() {
  const [columns, setColumns] = useState<any>({});
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Per-column reveal count — every stage starts collapsed to the top 5 deals;
  // "Show more" reveals another page at a time for just that one column.
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  const showMore = (stage: string) => {
    setVisibleCounts(prev => ({ ...prev, [stage]: (prev[stage] || PAGE_SIZE) + PAGE_SIZE }));
  };
  const showLess = (stage: string) => {
    setVisibleCounts(prev => ({ ...prev, [stage]: PAGE_SIZE }));
  };

  const fetchPipeline = async () => {
    setLoading(true);
    const res = await fetch('/api/crm/pipeline');
    const data = await res.json();
    if (data.success) {
      const cols: any = {};
      STAGES.forEach(s => cols[s] = { items: [], total: 0, count: 0 });
      data.data.forEach((group: any) => {
        if (cols[group._id]) {
          cols[group._id] = { items: group.deals, total: group.totalValue, count: group.count };
        }
      });
      setColumns(cols);
    }
    
    const anRes = await fetch('/api/crm/pipeline/analytics');
    const anData = await anRes.json();
    if (anData.success) setAnalytics(anData.data);
    
    setLoading(false);
  };

  useEffect(() => { fetchPipeline(); }, []);

  const onDragEnd = async (result: any) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    // Optimistic UI update
    const sourceCol = columns[source.droppableId];
    const destCol = columns[destination.droppableId];
    const sourceItems = [...sourceCol.items];
    const destItems = [...destCol.items];
    const [movedItem] = sourceItems.splice(source.index, 1);
    movedItem.stage = destination.droppableId;
    destItems.splice(destination.index, 0, movedItem);

    setColumns({
      ...columns,
      [source.droppableId]: { ...sourceCol, items: sourceItems },
      [destination.droppableId]: { ...destCol, items: destItems }
    });

    // API Call
    try {
      const res = await fetch(`/api/crm/opportunities/${draggableId}`, {
        method: 'PUT',
        body: JSON.stringify({ stage: destination.droppableId }),
        headers: { 'Content-Type': 'application/json' }
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Failed to update stage");
      toast.success("Deal stage updated");
      // Refetch analytics
      fetch('/api/crm/pipeline/analytics').then(r => r.json()).then(d => d.success && setAnalytics(d.data));
    } catch (e: any) {
      toast.error(e.message || "Failed to update stage, reverting");
      fetchPipeline(); // Revert
    }
  };

  if (loading) {
    return (
      <div className="space-y-8 p-8">
        <div className="space-y-4">
          <Skeleton className="h-12 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {STAGES.map(stage => (
            <div key={stage} className="border border-border/40 bg-background w-72 min-w-72 flex flex-col">
              <div className="p-4 border-b border-border/40 flex justify-between items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-6" />
              </div>
              <div className="flex-1 p-2 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      <div className="border-b border-border/40 pb-6">
        <h1 className="text-4xl font-black leading-none tracking-tighter text-primary md:text-[56px]">Pipeline</h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
          Drag deals between stages · {columns && Object.values(columns).reduce((n: number, c: any) => n + (c?.count || 0), 0)} deals
        </p>
      </div>

      {analytics && (
        // Hairline grid (same treatment as the Executive Dashboard tiles): tiles
        // share borders instead of floating as separate coloured boxes, and the
        // 3-up layout gives each value room so the graphic never overlaps it.
        <div className="grid grid-cols-1 gap-px border border-border/40 bg-border/40 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard className="rounded-none bg-background" title="Total Deals" value={Number(analytics.totalOpportunities).toLocaleString("en-IN")} visual={<UsersGraph />} />
          <StatCard className="rounded-none bg-background" title="Pipeline Value" value={formatInrCompact(analytics.totalPipelineValue)} visual={<ActivePulse />} />
          <StatCard className="rounded-none bg-background" title="Weighted Value" value={formatInrCompact(analytics.weightedPipeline)} visual={<UsersGraph />} />
          <StatCard className="rounded-none bg-background" title="Avg Deal Size" value={formatInrCompact(analytics.averageDealSize)} visual={<UsersGraph />} />
          <StatCard className="rounded-none bg-background" title="Win Rate" value={`${analytics.winRate.toFixed(1)}%`} visual={<ActivePulse />} />
          <StatCard className="rounded-none bg-background" title="Loss Rate" value={`${analytics.lossRate.toFixed(1)}%`} visual={<InactiveOrbit />} />
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div key={stage} className="flex w-72 min-w-72 shrink-0 flex-col border border-border/40 bg-background">
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3.5">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">{stage}</span>
                <Badge variant="outline" className="h-5 rounded-none border-border/40 bg-transparent px-1.5 font-mono text-[10px] text-muted-foreground">
                  {columns[stage]?.count || 0}
                </Badge>
              </div>
              <Droppable droppableId={stage}>
                {(provided, snapshot) => {
                  const allItems = columns[stage]?.items || [];
                  const visibleCount = visibleCounts[stage] || PAGE_SIZE;
                  const visibleItems = allItems.slice(0, visibleCount);
                  const remaining = allItems.length - visibleItems.length;
                  return (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`max-h-[65vh] min-h-[240px] space-y-3 overflow-y-auto p-3 transition-colors ${snapshot.isDraggingOver ? "bg-white/[0.03]" : ""}`}
                    >
                      {visibleItems.length === 0 && (
                        <p className="py-10 text-center font-mono text-xs text-muted-foreground/45">No deals</p>
                      )}
                      {visibleItems.map((item: any, index: number) => (
                        <Draggable key={item._id} draggableId={item._id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`border border-border/30 bg-white/[0.02] p-4 transition-colors hover:border-border/60 hover:bg-white/[0.04] ${snapshot.isDragging ? "border-border/70 bg-background shadow-lg" : ""}`}
                            >
                              <div className="truncate text-sm font-semibold" title={item.deal_name}>{item.deal_name}</div>
                              <div className="mt-1.5 font-sans text-sm font-bold tabular-nums">₹{Number(item.amount || 0).toLocaleString("en-IN")}</div>
                              <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground/70">
                                <span>{new Date(item.expected_close_date || Date.now()).toLocaleDateString("en-GB")}</span>
                                <span className="tabular-nums">{item.probability}%</span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {remaining > 0 && (
                        <Button variant="outline" size="sm" className="w-full gap-1.5 rounded-none border-dashed border-border/40 font-mono text-[10px] uppercase tracking-wider" onClick={() => showMore(stage)}>
                          <ChevronDown className="h-3.5 w-3.5" /> Show {Math.min(remaining, PAGE_SIZE)} more ({remaining} left)
                        </Button>
                      )}
                      {remaining <= 0 && visibleCount > PAGE_SIZE && allItems.length > PAGE_SIZE && (
                        <Button variant="ghost" size="sm" className="w-full gap-1.5 rounded-none font-mono text-[10px] uppercase tracking-wider" onClick={() => showLess(stage)}>
                          <ChevronUp className="h-3.5 w-3.5" /> Show less
                        </Button>
                      )}
                    </div>
                  );
                }}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
