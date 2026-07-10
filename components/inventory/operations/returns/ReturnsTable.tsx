import {
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/shared/Table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground/60",
  assigned: "text-[#6CADF5]",
  ready: "text-[#6CADF5]",
  done: "text-[#8AE06C]",
  cancel: "text-[#F56868]",
};

interface ReturnsTableProps {
  items: any[];
  handleView: (t: any) => void;
  updateStatus: (id: string, status: string) => Promise<void>;
}

export function ReturnsTable({
  items,
  handleView,
  updateStatus,
}: ReturnsTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Reference</TableHeaderCell>
          <TableHeaderCell className="text-left">Partner</TableHeaderCell>
          <TableHeaderCell className="text-left">Source Doc</TableHeaderCell>
          <TableHeaderCell className="text-left">Scheduled Date</TableHeaderCell>
          <TableHeaderCell className="text-center">Status</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((t) => (
          <TableRow key={t._id} onClick={() => handleView(t)}>
            {/* Reference */}
            <TableCell className="font-mono text-sm text-foreground">
              {t.header.name}
            </TableCell>

            {/* Partner */}
            <TableCell className="text-sm text-muted-foreground">
              {t.header.partnerId?.header?.name || "—"}
            </TableCell>

            {/* Source Document */}
            <TableCell className="font-mono text-xs text-muted-foreground">
              {t.header.sourceDocument || "—"}
            </TableCell>

            {/* Scheduled Date */}
            <TableCell className="text-sm text-muted-foreground font-mono">
              {new Date(t.header.scheduledDate).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </TableCell>

            {/* Status */}
            <TableCell className="text-center">
              <Badge
                className={`
                  rounded-none
                  border-0
                  bg-transparent
                  px-0
                  font-mono
                  text-[11px]
                  hover:bg-transparent
                  shadow-none
                  ${STATUS_COLORS[t.status] ?? "text-muted-foreground"}
                `}
              >
                {t.status}
              </Badge>
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1" onClick={(e) => e.stopPropagation()}>
              {t.status !== "done" && t.status !== "cancel" && (
                <Button
                  variant="ghost"
                  onClick={() => updateStatus(t._id, "done")}
                  className="h-8 px-2 text-xs rounded-none text-[#8AE06C] hover:bg-white/5 font-medium"
                >
                  Validate
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => handleView(t)}
                className="h-8 px-2 text-xs rounded-none text-[#6CADF5] hover:bg-white/5 font-medium"
              >
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableContainer>
  );
}
