'use client';

import { Network, Plus, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VisualWorkflowDesigner() {
  return (
    <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="w-6 h-6 text-purple-400" />
            Visual Workflow Designer
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Build and trace event-driven business logic.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-neutral-800 bg-neutral-900 h-8 text-xs"><Play className="w-3 h-3 mr-2" /> Preview Dry Run</Button>
          <Button className="bg-primary h-8 text-xs"><Save className="w-3 h-3 mr-2" /> Publish Workflow</Button>
        </div>
      </div>

      <div className="flex-1 border border-neutral-800 rounded-xl bg-neutral-950 flex relative overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-neutral-800 bg-neutral-900 p-4 overflow-y-auto">
          <h3 className="text-xs font-bold uppercase text-neutral-500 mb-3">Triggers</h3>
          <div className="space-y-2 mb-6">
            <div className="bg-neutral-950 border border-neutral-800 p-2 rounded text-xs cursor-move hover:border-purple-500">Record Created</div>
            <div className="bg-neutral-950 border border-neutral-800 p-2 rounded text-xs cursor-move hover:border-purple-500">Stage Changed</div>
            <div className="bg-neutral-950 border border-neutral-800 p-2 rounded text-xs cursor-move hover:border-purple-500">Date Reached</div>
          </div>
          
          <h3 className="text-xs font-bold uppercase text-neutral-500 mb-3">Actions</h3>
          <div className="space-y-2">
            <div className="bg-neutral-950 border border-neutral-800 p-2 rounded text-xs cursor-move hover:border-blue-500">Create Task</div>
            <div className="bg-neutral-950 border border-neutral-800 p-2 rounded text-xs cursor-move hover:border-blue-500">Send Email</div>
            <div className="bg-neutral-950 border border-neutral-800 p-2 rounded text-xs cursor-move hover:border-blue-500">Assign Owner</div>
          </div>
        </div>

        {/* Canvas (Mock representation since we can't build a full canvas library like React Flow natively in a single file without heavy external deps) */}
        <div className="flex-1 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] relative flex items-center justify-center p-10">
           <div className="flex flex-col items-center gap-6">
             <div className="bg-purple-900/20 border border-purple-500/50 p-4 rounded-lg w-64 shadow-lg">
               <div className="text-xs font-bold text-purple-400 mb-1">TRIGGER</div>
               <div className="text-sm font-medium">Opportunity Stage = Closed Won</div>
             </div>
             
             <div className="w-0.5 h-8 bg-neutral-700 relative">
               <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rotate-45 border-b-2 border-r-2 border-neutral-700"></div>
             </div>

             <div className="bg-blue-900/20 border border-blue-500/50 p-4 rounded-lg w-64 shadow-lg">
               <div className="text-xs font-bold text-blue-400 mb-1">ACTION</div>
               <div className="text-sm font-medium">Create Onboarding Plan</div>
             </div>
             
             <div className="w-0.5 h-8 bg-neutral-700 relative">
               <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rotate-45 border-b-2 border-r-2 border-neutral-700"></div>
             </div>

             <div className="bg-blue-900/20 border border-blue-500/50 p-4 rounded-lg w-64 shadow-lg">
               <div className="text-xs font-bold text-blue-400 mb-1">ACTION</div>
               <div className="text-sm font-medium">Notify Operations Team</div>
             </div>
             
             <Button variant="outline" className="mt-4 border-dashed border-neutral-600 bg-neutral-900/50 text-neutral-400 h-10 w-10 rounded-full p-0">
               <Plus className="w-4 h-4" />
             </Button>
           </div>
        </div>
      </div>
    </div>
  );
}
