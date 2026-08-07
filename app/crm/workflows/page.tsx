'use client';

import Link from "next/link";
import { Network, ListChecks } from "lucide-react";
import VisualWorkflowBuilder from "@/components/crm/VisualWorkflowBuilder";

/**
 * Visual ERP Builder (6.10) — a real React Flow drag-and-drop canvas over the
 * AutomationRule backend (see components/crm/VisualWorkflowBuilder.tsx). This
 * replaces the earlier static mock. The form-based builder on /crm/automations
 * remains as an alternate entry point for the same rules.
 */
export default function VisualWorkflowDesigner() {
  return (
    <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="w-6 h-6 text-purple-400" />
            Visual Workflow Builder
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Drag, connect, and publish event-driven automation — the same rules the form builder creates.
          </p>
        </div>
        <Link
          href="/crm/automations"
          className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1"
        >
          <ListChecks className="w-3.5 h-3.5" /> Rule list / form builder
        </Link>
      </div>

      <div className="flex-1 min-h-0">
        <VisualWorkflowBuilder />
      </div>
    </div>
  );
}
