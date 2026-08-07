'use client';
import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const STAGES = ['Prospecting','Discovery','Requirement Gathering','Solution Fit','Proposal Sent','Negotiation','Approval', 'Closed Won', 'Closed Lost'];

export default function PipelinePage() {
  const [columns, setColumns] = useState<any>({});
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="p-6">Loading Pipeline...</div>;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6 space-y-4">
        <h1 className="text-2xl font-bold">Kanban Pipeline</h1>
        {analytics && (
          <div className="grid grid-cols-6 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
              <p className="text-xs text-muted-foreground">Total Deals</p>
              <p className="text-xl font-bold">{analytics.totalOpportunities}</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
              <p className="text-xs text-muted-foreground">Pipeline Value</p>
              <p className="text-xl font-bold text-green-500">₹{analytics.totalPipelineValue.toLocaleString()}</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
              <p className="text-xs text-muted-foreground">Weighted Value</p>
              <p className="text-xl font-bold text-blue-400">₹{analytics.weightedPipeline.toLocaleString()}</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
              <p className="text-xs text-muted-foreground">Avg Deal Size</p>
              <p className="text-xl font-bold">₹{analytics.averageDealSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-xl font-bold">{analytics.winRate.toFixed(1)}%</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
              <p className="text-xs text-muted-foreground">Loss Rate</p>
              <p className="text-xl font-bold text-red-500">{analytics.lossRate.toFixed(1)}%</p>
            </div>
          </div>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {STAGES.map(stage => (
            <div key={stage} className="bg-neutral-900 border border-neutral-800 rounded-lg w-80 min-w-80 flex flex-col h-full">
              <div className="p-4 border-b border-neutral-800 font-bold flex justify-between items-center">
                <span>{stage}</span>
                <Badge variant="outline">{columns[stage]?.count || 0}</Badge>
              </div>
              <Droppable droppableId={stage}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className={`flex-1 p-2 space-y-2 overflow-y-auto ${snapshot.isDraggingOver ? 'bg-neutral-800/50' : ''}`}>
                    {columns[stage]?.items.map((item: any, index: number) => (
                      <Draggable key={item._id} draggableId={item._id} index={index}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} 
                            className={`p-4 bg-neutral-800 border border-neutral-700 rounded shadow-sm ${snapshot.isDragging ? 'opacity-70' : ''}`}>
                            <div className="font-bold">{item.deal_name}</div>
                            <div className="text-sm text-green-400 font-mono mt-1">₹{item.amount?.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                              <span>{new Date(item.expected_close_date || Date.now()).toLocaleDateString()}</span>
                              <span>{item.probability}%</span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
