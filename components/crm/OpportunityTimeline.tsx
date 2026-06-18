'use client';
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function OpportunityTimeline({ oppId }: { oppId: string }) {
  const [timeline, setTimeline] = useState<any[]>([]);

  useEffect(() => {
    // Note: To make this fully functional we'd fetch an aggregated array of activities, stage changes, and tasks.
    // We fetch activities as a proxy for timeline.
    fetch(`/api/crm/activities?linked_record_id=${oppId}`)
      .then(res => res.json())
      .then(d => {
        if (d.success) {
          const formatted = d.data.activities.map((a: any) => ({
            type: a.type,
            title: a.subject,
            date: a.activity_date,
            user: a.performed_by_id?.name || 'System',
            description: a.description
          }));
          setTimeline(formatted);
        }
      });
  }, [oppId]);

  if (!timeline || timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">No events recorded yet.</p>;
  }

  // Sort timeline by date descending
  const sorted = [...timeline].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="border-l-2 border-neutral-800 pl-6 space-y-6">
      {sorted.map((item, i) => (
        <div key={i} className="relative">
          <div className={`absolute -left-[31px] w-4 h-4 rounded-full mt-1.5 border-2 ${item.type === 'stage_change' ? 'bg-blue-600 border-blue-900' : 'bg-neutral-900 border-primary'}`} />
          <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-lg shadow-sm">
            <h4 className="font-bold flex items-center gap-2">
              {item.title}
              <Badge variant="secondary" className="text-[10px]">{item.type}</Badge>
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(item.date), 'MMM d, yyyy h:mm a')} by {item.user}
            </p>
            {item.description && <p className="text-sm text-neutral-300 mt-2 whitespace-pre-wrap">{item.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
