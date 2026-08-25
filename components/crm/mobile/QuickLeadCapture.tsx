'use client';

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OfflineQueue } from "@/lib/crm/mobile/offlineQueue";
import { toast } from "sonner";

export default function QuickLeadCapture({ onComplete }: { onComplete: () => void }) {
  const [formData, setFormData] = useState({ lead_name: "", company_name: "", phone: "", source: "Field Visit", notes: "" });

  const handleSubmit = (e: any) => {
    e.preventDefault();
    
    if (!formData.lead_name || !formData.company_name) return toast.error("Name and Company required");

    OfflineQueue.enqueue({
      url: "/api/crm/leads",
      method: "POST",
      payload: formData,
      type: "Lead"
    });

    toast.success("Lead queued for sync");
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Quick Lead</h2>
      <div>
        <label className="text-xs text-muted-foreground">Name</label>
        <Input required value={formData.lead_name} onChange={e => setFormData({...formData, lead_name: e.target.value})} className="bg-card border-border" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Company</label>
        <Input required value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} className="bg-card border-border" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Phone</label>
        <Input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="bg-card border-border" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Notes</label>
        <textarea 
          value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} 
          className="w-full bg-card border border-border rounded-md p-3 text-sm h-24"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1 border-border" onClick={onComplete}>Cancel</Button>
        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">Save</Button>
      </div>
    </form>
  );
}
