'use client';
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RotateCw, FolderKanban } from "lucide-react";

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
    <div className="space-y-6">
      {/* Card Header & Toolbar */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-8 border-b border-border/20 mb-8">
        <div className="shrink-0">
          <h2 className="text-[30px] font-medium tracking-[-0.05em]">
            All Activities
          </h2>

          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
            {activities.length} {activities.length === 1 ? "Activity" : "Activities"}
          </p>
        </div>

        <div className="w-full max-w-4xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
          {/* Search Input */}
          <div className="w-full max-w-xs">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search activities..."
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border/40">
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "All" ? "All Types" : t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            {/* Refresh Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchActivities(1)}
              className="h-10 w-10 border border-border/20 bg-white/[0.02] rounded-none hover:bg-white/5 transition-all duration-300"
              title="Refresh Timeline"
            >
              <RotateCw className="h-4 w-4" />
            </Button>

            {/* Export CSV Button */}
            <Button
              variant="outline"
              className="h-10 px-4 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground border border-border/20 transition-all duration-300"
            >
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {loading && !loadingMore ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-border/30 p-6 bg-white/[0.01] space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
                <div className="flex-1 space-y-3">
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.length === 0 && (
            <div className="py-24 text-center">
              <FolderKanban className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
              <h3 className="text-lg font-medium text-foreground">No activities found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Try adjusting your search query or filters.
              </p>
            </div>
          )}
          {filtered.map((a: any) => {
            const normalizedOutcome = a.outcome?.toLowerCase() || "";
            const isFailed = normalizedOutcome.includes("fail") || normalizedOutcome.includes("cancel") || normalizedOutcome.includes("error");

            let badgeColor = "text-muted-foreground";

            if (isFailed) {
              badgeColor = "text-[#F56868]";
            } else {
              const colors: Record<string, string> = {
                Call: "text-[#6CADF5]",
                Email: "text-[#6CADF5]",
                WhatsApp: "text-[#8AE06C]",
                Meeting: "text-[#A77DFF]",
                'Quote Sent': "text-[#8AE06C]",
                Task: "text-[#F1DF38]",
                'Support Interaction': "text-[#F1DF38]",
                Note: "text-muted-foreground",
              };
              badgeColor = colors[a.type] ?? "text-muted-foreground";
            }

            let relatedRecordLabel = null;
            if (a.linked_lead_id) relatedRecordLabel = "Lead";
            else if (a.linked_account_id) relatedRecordLabel = "Account";
            else if (a.linked_contact_id) relatedRecordLabel = "Contact";
            else if (a.linked_opportunity_id) relatedRecordLabel = "Opportunity";
            else if (a.linked_case_id) relatedRecordLabel = "Case";

            return (
              <Card key={a._id} className="overflow-hidden border border-border/30 hover:border-border/60 shadow-none bg-white/[0.01] transition-all duration-300 rounded-none group p-6">
                <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
                  {/* Left side info */}
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={`
                          rounded-none
                          border-0
                          bg-transparent
                          px-0
                          font-mono
                          text-[12px]
                          uppercase
                          hover:bg-transparent
                          shadow-none
                          ${badgeColor}
                        `}
                      >
                        {a.type}
                      </Badge>
                      {relatedRecordLabel && (
                        <>
                          <span className="text-muted-foreground/30 font-mono text-[11px]">•</span>
                          <span className="font-mono text-[11px] text-muted-foreground/50 uppercase tracking-[0.05em]">
                            {relatedRecordLabel}
                          </span>
                        </>
                      )}
                    </div>
                    <h4 className="font-medium text-foreground text-[18px] tracking-[-0.03em] transition-opacity duration-300 group-hover:opacity-80">
                      {a.subject}
                    </h4>
                    {a.description && (
                      <p className="text-sm text-muted-foreground/80 leading-relaxed whitespace-pre-wrap pl-3 border-l border-border/20">
                        {a.description}
                      </p>
                    )}
                  </div>

                  {/* Right side info */}
                  <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0 md:text-right">
                    <p className="font-mono text-[11px] text-muted-foreground/85">
                      {format(new Date(a.activity_date), 'MMM d, yyyy h:mm a')}
                    </p>
                    <p className="text-xs text-muted-foreground/50">
                      by <span className="font-mono text-[11px] text-muted-foreground/70">{a.performed_by_id?.name || 'System User'}</span>
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
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
