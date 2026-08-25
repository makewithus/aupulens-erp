'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OfflineQueue } from "@/lib/crm/mobile/offlineQueue";
import { toast } from "sonner";
import { PhoneIncoming, PhoneOutgoing } from "lucide-react";

export default function CallLogger({ onComplete }: { onComplete: () => void }) {
  const [direction, setDirection] = useState("outbound");
  const [outcome, setOutcome] = useState("Connected");
  const [notes, setNotes] = useState("");
  // Mock record ID for demo
  const [recordId] = useState("65f1a2b3c4d5e6f7a8b9c0d1");

  const handleSubmit = () => {
    OfflineQueue.enqueue({
      url: "/api/crm/communications",
      method: "POST",
      payload: {
        recordId,
        recordType: "Lead",
        channel: "Phone Call",
        direction,
        message: `Outcome: ${outcome}\nNotes: ${notes}`,
        status: "Completed"
      },
      type: "Activity"
    });
    toast.success("Call logged");
    onComplete();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Log Call</h2>
      
      <div className="flex gap-2">
        <Button 
          variant={direction === "outbound" ? "default" : "outline"} 
          className="flex-1 h-12" onClick={() => setDirection("outbound")}
        >
          <PhoneOutgoing className="w-4 h-4 mr-2" /> Outbound
        </Button>
        <Button 
          variant={direction === "inbound" ? "default" : "outline"} 
          className="flex-1 h-12" onClick={() => setDirection("inbound")}
        >
          <PhoneIncoming className="w-4 h-4 mr-2" /> Inbound
        </Button>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-2">Outcome</label>
        <div className="grid grid-cols-2 gap-2">
          {["Connected", "Left Voicemail", "No Answer", "Busy"].map(o => (
            <Button 
              key={o} size="sm" 
              variant={outcome === o ? "secondary" : "outline"}
              className={`border-border ${outcome === o ? 'bg-accent' : 'bg-transparent'}`}
              onClick={() => setOutcome(o)}
            >
              {o}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Notes</label>
        <textarea 
          value={notes} onChange={e => setNotes(e.target.value)} 
          className="w-full bg-card border border-border rounded-md p-3 text-sm h-32"
          placeholder="Call summary..."
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1 border-border" onClick={onComplete}>Cancel</Button>
        <Button type="button" onClick={handleSubmit} className="flex-1 bg-green-600 hover:bg-green-700 text-white">Save Log</Button>
      </div>
    </div>
  );
}
