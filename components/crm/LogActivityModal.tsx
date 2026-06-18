'use client';
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const ACTIVITY_TYPES = [
  "Call", "Email", "Meeting", "Note", "Task", "Visit",
  "Quote Sent", "Proposal Discussed", "Document Shared", "WhatsApp", "Support Interaction"
];

interface LogActivityModalProps {
  linkedRecordType: "Lead" | "Account" | "Contact" | "Opportunity" | "Case";
  linkedRecordId: string;
}

export function LogActivityModal({ linkedRecordType, linkedRecordId }: LogActivityModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    type: "Call",
    subject: "",
    description: "",
    activity_date: new Date().toISOString().slice(0, 16),
  });

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim()) {
      toast.error("Subject is required.");
      return;
    }

    setLoading(true);

    const payload: any = {
      type: form.type,
      subject: form.subject.trim(),
      description: form.description.trim() || undefined,
      activity_date: new Date(form.activity_date).toISOString(),
    };

    if (linkedRecordType === "Lead") payload.linked_lead_id = linkedRecordId;
    if (linkedRecordType === "Account") payload.linked_account_id = linkedRecordId;
    if (linkedRecordType === "Contact") payload.linked_contact_id = linkedRecordId;
    if (linkedRecordType === "Opportunity") payload.linked_opportunity_id = linkedRecordId;
    if (linkedRecordType === "Case") payload.linked_case_id = linkedRecordId;

    try {
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to log activity");
        return;
      }

      toast.success("Activity logged successfully!");
      setOpen(false);
      setForm({
        type: "Call",
        subject: "",
        description: "",
        activity_date: new Date().toISOString().slice(0, 16),
      });
      router.refresh();
    } catch (err) {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Log Activity</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleLog} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Activity Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v })}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Subject <span className="text-red-500">*</span></Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="e.g. Discovery Call"
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Date & Time</Label>
            <Input
              type="datetime-local"
              value={form.activity_date}
              onChange={(e) => setForm({ ...form, activity_date: e.target.value })}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Notes / Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Discussion points..."
              rows={4}
              disabled={loading}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Logging...</> : "Save Activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
