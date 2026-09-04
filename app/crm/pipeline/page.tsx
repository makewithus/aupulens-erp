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
      <div className="p-6 h-full flex flex-col">
        <div className="mb-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {STAGES.map(stage => (
            <div key={stage} className="bg-card border border-border rounded-lg w-80 min-w-80 flex flex-col h-full">
              <div className="p-4 border-b border-border flex justify-between items-center">
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
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6 space-y-4">
        <h1 className="text-2xl font-bold">Kanban Pipeline</h1>
        {analytics && (
          <div className="grid grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-6">
            <StatCard title="Total Deals" value={analytics.totalOpportunities} visual={<UsersGraph />} />
            <StatCard title="Pipeline Value" value={`₹${analytics.totalPipelineValue.toLocaleString()}`} visual={<ActivePulse />} />
            <StatCard title="Weighted Value" value={`₹${analytics.weightedPipeline.toLocaleString()}`} visual={<UsersGraph />} />
            <StatCard title="Avg Deal Size" value={`₹${analytics.averageDealSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} visual={<UsersGraph />} />
            <StatCard title="Win Rate" value={`${analytics.winRate.toFixed(1)}%`} visual={<ActivePulse />} />
            <StatCard title="Loss Rate" value={`${analytics.lossRate.toFixed(1)}%`} visual={<InactiveOrbit />} />
          </div>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {STAGES.map(stage => (
            <div key={stage} className="bg-card border border-border rounded-lg w-80 min-w-80 flex flex-col h-full">
              <div className="p-4 border-b border-border font-bold flex justify-between items-center">
                <span>{stage}</span>
                <Badge variant="outline">{columns[stage]?.count || 0}</Badge>
              </div>
              <Droppable droppableId={stage}>
                {(provided, snapshot) => {
                  const allItems = columns[stage]?.items || [];
                  const visibleCount = visibleCounts[stage] || PAGE_SIZE;
                  const visibleItems = allItems.slice(0, visibleCount);
                  const remaining = allItems.length - visibleItems.length;
                  return (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={`flex-1 p-2 space-y-2 overflow-y-auto ${snapshot.isDraggingOver ? 'bg-accent/50' : ''}`}>
                      {visibleItems.map((item: any, index: number) => (
                        <Draggable key={item._id} draggableId={item._id} index={index}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                              className={`p-4 bg-accent border border-border rounded shadow-sm ${snapshot.isDragging ? 'opacity-70' : ''}`}>
                              <div className="font-bold">{item.deal_name}</div>
                              <div className="text-sm text-green-600 dark:text-green-400 font-sans tabular-nums mt-1">₹{item.amount?.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                                <span>{new Date(item.expected_close_date || Date.now()).toLocaleDateString()}</span>
                                <span>{item.probability}%</span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {remaining > 0 && (
                        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => showMore(stage)}>
                          <ChevronDown className="h-3.5 w-3.5" /> Show {Math.min(remaining, PAGE_SIZE)} more ({remaining} left)
                        </Button>
                      )}
                      {remaining <= 0 && visibleCount > PAGE_SIZE && allItems.length > PAGE_SIZE && (
                        <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => showLess(stage)}>
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
