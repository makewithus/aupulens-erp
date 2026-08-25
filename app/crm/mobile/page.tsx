'use client';

import { useState } from "react";
import { Search, MapPin, Mic, UserPlus, Phone, AlignLeft } from "lucide-react";
import QuickLeadCapture from "@/components/crm/mobile/QuickLeadCapture";
import CallLogger from "@/components/crm/mobile/CallLogger";
import VoiceNotes from "@/components/crm/mobile/VoiceNotes";
import MobilePipeline from "@/components/crm/mobile/MobilePipeline";
import MobileSearch from "@/components/crm/mobile/MobileSearch";
import QuickFollowUp from "@/components/crm/mobile/QuickFollowUp";
import { Button } from "@/components/ui/button";
import { OfflineQueue } from "@/lib/crm/mobile/offlineQueue";
import { toast } from "sonner";

export default function MobileCRMHome() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const handleSync = async () => {
    toast.info("Syncing offline queue...");
    await OfflineQueue.sync();
    const remaining = OfflineQueue.getQueue().length;
    if (remaining > 0) {
      toast.error(`${remaining} actions failed to sync`);
    } else {
      toast.success("Sync complete");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-md mx-auto bg-background text-foreground relative overflow-hidden pb-16 md:pb-0 md:h-[800px] md:border md:border-border md:mt-8 md:rounded-3xl">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-border bg-card sticky top-0 z-10">
        <h1 className="font-bold text-lg">Aupulens Mobile</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSync}>
             <div className={`w-2 h-2 rounded-full ${typeof window !== 'undefined' && navigator.onLine ? 'bg-green-500' : 'bg-red-500'}`} />
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && (
          <div className="p-4 space-y-4">
            <MobileSearch />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-2 bg-card border-border" onClick={() => setActiveTab("lead")}>
                <UserPlus className="w-6 h-6 text-blue-400" /> <span className="text-xs">New Lead</span>
              </Button>
              <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-2 bg-card border-border" onClick={() => setActiveTab("call")}>
                <Phone className="w-6 h-6 text-green-400" /> <span className="text-xs">Log Call</span>
              </Button>
              <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-2 bg-card border-border" onClick={() => setActiveTab("voice")}>
                <Mic className="w-6 h-6 text-purple-400" /> <span className="text-xs">Voice Note</span>
              </Button>
              <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-2 bg-card border-border" onClick={() => setActiveTab("pipeline")}>
                <AlignLeft className="w-6 h-6 text-orange-400" /> <span className="text-xs">Pipeline</span>
              </Button>
            </div>
            
            <div className="mt-6">
              <h3 className="font-semibold text-sm mb-3 text-muted-foreground">Quick Actions (Nearby)</h3>
              <QuickFollowUp />
            </div>
          </div>
        )}

        {activeTab === "lead" && <div className="p-4"><QuickLeadCapture onComplete={() => setActiveTab("dashboard")} /></div>}
        {activeTab === "call" && <div className="p-4"><CallLogger onComplete={() => setActiveTab("dashboard")} /></div>}
        {activeTab === "voice" && <div className="p-4"><VoiceNotes onComplete={() => setActiveTab("dashboard")} /></div>}
        {activeTab === "pipeline" && <MobilePipeline />}
      </div>

      {/* Bottom Nav Bar */}
      <div className="absolute bottom-0 w-full bg-card border-t border-border flex justify-around p-3 pb-safe z-10">
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto py-1" onClick={() => setActiveTab("dashboard")}>
          <Search className={`w-5 h-5 ${activeTab === 'dashboard' ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="text-[10px] text-muted-foreground">Home</span>
        </Button>
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto py-1" onClick={() => setActiveTab("pipeline")}>
          <AlignLeft className={`w-5 h-5 ${activeTab === 'pipeline' ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="text-[10px] text-muted-foreground">Deals</span>
        </Button>
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto py-1">
          <MapPin className="w-5 h-5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Visits</span>
        </Button>
      </div>
    </div>
  );
}
