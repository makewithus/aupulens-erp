'use client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogActivityModal } from "@/components/crm/LogActivityModal";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const LEAD_STATUSES = [
  "New", "Attempting Contact", "Connected", "Qualified", "Nurture", "Disqualified"
];

export default function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);

  const fetchLead = async () => {
    const res = await fetch(`/api/crm/leads/${params.id}`);
    const data = await res.json();
    if (data.success) {
      setLead(data.data);
    } else {
      toast.error(data.message);
      router.push("/crm/leads");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLead();
  }, [params.id]);

  const handleUpdateStatus = async (newStatus: string) => {
    setStatusUpdating(true);
    const payload: any = { status: newStatus };
    
    // Auto-fill budget and timeline to pass validation if qualifying
    if (newStatus === "Qualified") {
      if (!lead.budget_range) payload.budget_range = "₹10k - ₹50k";
      if (!lead.expected_timeline) payload.expected_timeline = "3 Months";
    }

    try {
      const res = await fetch(`/api/crm/leads/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Status updated to ${newStatus}`);
        setLead(data.data);
      } else {
        toast.error(data.message || "Failed to update status");
      }
    } catch (e) {
      toast.error("Network error.");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleConvert = async () => {
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/crm/leads/${params.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createAccount: true,
          createContact: true,
          createOpportunity: true,
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Lead converted successfully!");
        setConvertModalOpen(false);
        fetchLead(); // refresh the data to show 'Converted' status
      } else {
        toast.error(data.message || "Failed to convert lead.");
      }
    } catch (e) {
      toast.error("Network error.");
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!lead) return <div className="p-6">Lead not found</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {lead.lead_name}
            <Badge>{lead.status}</Badge>
            <Badge className="bg-green-600">Score: {lead.lead_score}</Badge>
          </h1>
          <p className="text-muted-foreground">{lead.company_name}</p>
        </div>
        <div className="flex gap-2">
          <LogActivityModal linkedRecordType="Lead" linkedRecordId={params.id} />
          {lead.status === 'Qualified' && (
            <Button 
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => setConvertModalOpen(true)}
              disabled={statusUpdating}
            >
              Convert
            </Button>
          )}
        </div>
      </div>
      
      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to convert this lead? This will automatically create a new Account, Contact, and Opportunity in the CRM based on this lead&apos;s data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConvertModalOpen(false)} disabled={statusUpdating}>
              Cancel
            </Button>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleConvert} disabled={statusUpdating}>
              {statusUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Conversion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">Activity Timeline</h2>
          <ActivityTimeline linkedRecordId={params.id} />
        </div>
        
        <div className="col-span-1 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Lead Info</h2>
            <div className="space-y-4 text-sm">
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground font-medium">Status</span>
                <Select
                  value={lead.status}
                  onValueChange={handleUpdateStatus}
                  disabled={statusUpdating || lead.status === 'Converted'}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Update status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p><span className="text-muted-foreground">Email:</span> {lead.email || '-'}</p>
              <p><span className="text-muted-foreground">Phone:</span> {lead.phone || '-'}</p>
              <p><span className="text-muted-foreground">Source:</span> {lead.source || '-'}</p>
              <p><span className="text-muted-foreground">Priority:</span> {lead.priority}</p>
              <p><span className="text-muted-foreground">Budget:</span> {lead.budget_range || '-'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
