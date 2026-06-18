'use client';

import { Calendar, Mail, FileText, Activity } from "lucide-react";
import { toast } from "sonner";
import { OfflineQueue } from "@/lib/crm/mobile/offlineQueue";

export default function QuickFollowUp() {
  const handleAction = (type: string) => {
    OfflineQueue.enqueue({
      url: "/api/crm/tasks",
      method: "POST",
      payload: {
        title: `Follow Up: ${type}`,
        due_date: new Date(Date.now() + 86400000), // tomorrow
        priority: "High",
        related_record_type: "Lead",
        related_record_id: "mock_id"
      },
      type: "Task"
    });
    toast.success(`${type} Task Created`);
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      <button onClick={() => handleAction("Call Back")} className="flex flex-col items-center gap-2 p-2 bg-neutral-900 rounded-lg active:scale-95 transition-transform border border-neutral-800">
        <div className="w-8 h-8 rounded-full bg-blue-900/30 text-blue-400 flex items-center justify-center"><Activity className="w-4 h-4" /></div>
        <span className="text-[10px] text-center text-neutral-400">Call Back</span>
      </button>
      <button onClick={() => handleAction("Send Proposal")} className="flex flex-col items-center gap-2 p-2 bg-neutral-900 rounded-lg active:scale-95 transition-transform border border-neutral-800">
        <div className="w-8 h-8 rounded-full bg-purple-900/30 text-purple-400 flex items-center justify-center"><FileText className="w-4 h-4" /></div>
        <span className="text-[10px] text-center text-neutral-400">Proposal</span>
      </button>
      <button onClick={() => handleAction("Schedule Demo")} className="flex flex-col items-center gap-2 p-2 bg-neutral-900 rounded-lg active:scale-95 transition-transform border border-neutral-800">
        <div className="w-8 h-8 rounded-full bg-orange-900/30 text-orange-400 flex items-center justify-center"><Calendar className="w-4 h-4" /></div>
        <span className="text-[10px] text-center text-neutral-400">Demo</span>
      </button>
      <button onClick={() => handleAction("Email Follow Up")} className="flex flex-col items-center gap-2 p-2 bg-neutral-900 rounded-lg active:scale-95 transition-transform border border-neutral-800">
        <div className="w-8 h-8 rounded-full bg-green-900/30 text-green-400 flex items-center justify-center"><Mail className="w-4 h-4" /></div>
        <span className="text-[10px] text-center text-neutral-400">Email</span>
      </button>
    </div>
  );
}
