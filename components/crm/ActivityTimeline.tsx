'use client';
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function ActivityTimeline({ linkedRecordId }: { linkedRecordId?: string }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const types = ['All', 'Call', 'Email', 'Meeting', 'Note', 'Task', 'WhatsApp', 'Support Interaction', 'Quote Sent'];

  const fetchActivities = async (pageNum: number, isLoadMore = false) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    let url = `/api/crm/activities?limit=15&page=${pageNum}`;
    if (linkedRecordId) url += `&linked_record_id=${linkedRecordId}`;
    if (typeFilter !== 'All') url += `&type=${typeFilter}`;

    try {
      const res = await fetch(url);
      const d = await res.json();
      if (d.success) {
        if (isLoadMore) {
          setActivities(prev => [...prev, ...d.data.activities]);
        } else {
          setActivities(d.data.activities);
        }
        setHasMore(pageNum < d.data.totalPages);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchActivities(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedRecordId, typeFilter]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchActivities(nextPage, true);
  };

  const filtered = activities.filter(a => {
    if (search && !a.subject.toLowerCase().includes(search.toLowerCase()) && !a.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-6">
        <Input placeholder="Search activities..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        <select className="bg-neutral-900 border border-neutral-800 rounded px-3 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button variant="outline">Export CSV</Button>
      </div>

      {loading && !loadingMore ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border-l-2 border-neutral-800 pl-6 space-y-6">
          {filtered.length === 0 && <p className="text-muted-foreground text-sm">No activities found.</p>}
          {filtered.map((a: any) => (
            <div key={a._id} className="relative">
              <div className="absolute -left-[31px] bg-neutral-900 border-2 border-primary w-4 h-4 rounded-full mt-1.5" />
              <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-lg shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold flex items-center gap-2 text-white">
                      {a.subject}
                      <Badge variant="secondary" className="text-[10px]">{a.type}</Badge>
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(a.activity_date), 'MMM d, yyyy h:mm a')} by {a.performed_by_id?.name || 'System User'}
                    </p>
                  </div>
                </div>
                {a.description && <p className="text-sm text-neutral-300 mt-2 whitespace-pre-wrap">{a.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && filtered.length > 0 && (
        <Button variant="ghost" className="w-full mt-4" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Load More..."}
        </Button>
      )}
    </div>
  );
}
