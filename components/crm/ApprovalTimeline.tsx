'use client';

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, RotateCcw, User, ChevronRight } from "lucide-react";

interface ApprovalEntry {
  _id: string;
  type?: string;
  status: string;
  request_notes?: string;
  decision_notes?: string;
  decided_at?: string;
  createdAt?: string;
  requested_by_id?: { name?: string; email?: string } | null;
  approver_id?: { name?: string; email?: string } | null;
}

interface ApprovalTimelineProps {
  approvalHistory?: ApprovalEntry[];
  currentStatus?: string;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ComponentType<any>; color: string; bg: string; border: string }
> = {
  Pending: {
    icon: Clock,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    border: "border-yellow-700",
  },
  Approved: {
    icon: CheckCircle2,
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-700",
  },
  Rejected: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-700",
  },
  "Changes Requested": {
    icon: RotateCcw,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-700",
  },
};

function ApprovalEntry({ entry, isLast }: { entry: ApprovalEntry; isLast: boolean }) {
  const cfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG["Pending"];
  const Icon = cfg.icon;

  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center border ${cfg.bg} ${cfg.border} flex-shrink-0`}
        >
          <Icon className={`w-4 h-4 ${cfg.color}`} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-accent mt-1" />}
      </div>

      {/* Content */}
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{entry.type || "Approval"}</span>
          <Badge
            variant="outline"
            className={`text-xs ${cfg.color} border-current`}
          >
            {entry.status}
          </Badge>
          {entry.createdAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(entry.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        {entry.request_notes && (
          <p className="text-xs text-muted-foreground mt-1">{entry.request_notes}</p>
        )}

        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          {entry.requested_by_id && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              Requested by:{" "}
              <span className="text-foreground">
                {entry.requested_by_id.name || entry.requested_by_id.email}
              </span>
            </span>
          )}
          {entry.approver_id && (
            <span className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              Approver:{" "}
              <span className="text-foreground">
                {entry.approver_id.name || entry.approver_id.email}
              </span>
            </span>
          )}
        </div>

        {(entry.status === "Approved" ||
          entry.status === "Rejected" ||
          entry.status === "Changes Requested") &&
          entry.decided_at && (
            <div
              className={`mt-2 p-2 rounded border text-xs ${cfg.bg} ${cfg.border}`}
            >
              <span className="font-semibold">Decision ({new Date(entry.decided_at).toLocaleDateString()}):</span>{" "}
              {entry.decision_notes || "No notes provided."}
            </div>
          )}
      </div>
    </div>
  );
}

export default function ApprovalTimeline({
  approvalHistory,
  currentStatus,
}: ApprovalTimelineProps) {
  if (!approvalHistory || approvalHistory.length === 0) {
    return (
      <div className="bg-card border border-border p-6 rounded-lg">
        <h3 className="font-bold mb-2">Approval History</h3>
        <p className="text-sm text-muted-foreground">
          {currentStatus === "Draft"
            ? "This quote has not been submitted for approval yet."
            : "No approval records found."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border p-6 rounded-lg">
      <h3 className="font-bold mb-6">Approval Timeline</h3>
      <div>
        {approvalHistory.map((entry, i) => (
          <ApprovalEntry
            key={entry._id}
            entry={entry}
            isLast={i === approvalHistory.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
