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
import {
  STOCK_MOVE_STATUS,
  STOCK_MOVE_STATUS_LABELS,
  type StockMoveStatus,
  getNextStockMoveStatuses,
} from "@/lib/constants/statuses";

const TYPE_COLORS: Record<string, string> = {
  internal: "text-[#6CADF5]",
  incoming: "text-[#8AE06C]",
  outgoing: "text-[#F1DF38]",
  adjustment: "text-[#A77DFF]",
};

const STATUS_COLORS: Record<string, string> = {
  requested: "text-muted-foreground/60",
  source_validated: "text-[#6CADF5]",
  destination_assigned: "text-[#A77DFF]",
  move_executed: "text-[#F1DF38]",
  valuation_updated: "text-[#8AE06C]",
  accounting_created: "text-[#8AE06C]",
  cancelled: "text-[#F56868]",
};

interface StockMovesTableProps {
  paged: any[];
  advanceStatus: (id: string, newStatus: StockMoveStatus) => Promise<void>;
  handleView: (m: any) => void;
  handleEdit: (m: any) => void;
  handleDelete: (id: string) => void;
}

export function StockMovesTable({
  paged,
  advanceStatus,
  handleView,
  handleEdit,
  handleDelete,
}: StockMovesTableProps) {
  const nextActionLabel = (status: StockMoveStatus): string | null => {
    const map: Record<string, string> = {
      requested: "Validate Source",
      source_validated: "Assign Dest.",
      destination_assigned: "Execute Move",
      move_executed: "Update Valuation",
      valuation_updated: "Create Accounting",
    };
    return map[status] || null;
  };

  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Reference</TableHeaderCell>
          <TableHeaderCell className="text-left">Type</TableHeaderCell>
          <TableHeaderCell className="text-left">Source</TableHeaderCell>
          <TableHeaderCell className="text-left">Destination</TableHeaderCell>
          <TableHeaderCell className="text-left">Status</TableHeaderCell>
          <TableHeaderCell className="text-right">Valuation</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {paged.map((m) => {
          const next = getNextStockMoveStatuses(m.moveStatus);
          const happyNext = next.find(
            (s) => s !== STOCK_MOVE_STATUS.CANCELLED,
          );
          const actionLabel = nextActionLabel(m.moveStatus);

          return (
            <TableRow key={m._id}>
              {/* Reference */}
              <TableCell>
                <div className="font-bold text-sm text-foreground">{m.reference}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  {new Date(m.scheduledDate).toLocaleDateString()}
                </div>
              </TableCell>

              {/* Type */}
              <TableCell>
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
                    ${TYPE_COLORS[m.moveType] ?? "text-muted-foreground"}
                  `}
                >
                  {m.moveType.toLowerCase()}
                </Badge>
              </TableCell>

              {/* Source */}
              <TableCell className="text-sm text-muted-foreground">
                {m.sourceLocation?.warehouseName || "—"}
                {m.sourceLocation?.zone && (
                  <span className="text-muted-foreground/50 text-xs ml-1">
                    / {m.sourceLocation.zone}
                  </span>
                )}
              </TableCell>

              {/* Destination */}
              <TableCell className="text-sm text-muted-foreground">
                {m.destinationLocation?.warehouseName || "—"}
                {m.destinationLocation?.zone && (
                  <span className="text-muted-foreground/50 text-xs ml-1">
                    / {m.destinationLocation.zone}
                  </span>
                )}
              </TableCell>

              {/* Status */}
              <TableCell>
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
                    ${STATUS_COLORS[m.moveStatus] ?? "text-muted-foreground"}
                  `}
                >
                  {(STOCK_MOVE_STATUS_LABELS[m.moveStatus as StockMoveStatus] || m.moveStatus).toLowerCase()}
                </Badge>
              </TableCell>

              {/* Valuation */}
              <TableCell className="text-right font-mono text-sm text-foreground">
                ₹{(m.valuation?.totalValue || 0).toLocaleString()}
              </TableCell>

              {/* Actions */}
              <TableCell className="text-right whitespace-nowrap space-x-1">
                {/* Next status action */}
                {happyNext && actionLabel && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-none border-border/40 bg-white/[0.02] text-xs font-mono hover:bg-white/5 text-foreground px-2"
                    onClick={() => advanceStatus(m._id, happyNext as StockMoveStatus)}
                  >
                    {actionLabel}
                  </Button>
                )}

                {/* Cancel */}
                {next.includes(STOCK_MOVE_STATUS.CANCELLED as StockMoveStatus) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs rounded-none text-[#F56868] hover:bg-white/5 font-medium"
                    onClick={() =>
                      advanceStatus(
                        m._id,
                        STOCK_MOVE_STATUS.CANCELLED as StockMoveStatus,
                      )
                    }
                  >
                    Cancel
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onClick={() => handleView(m)}
                  className="h-8 px-2 text-xs rounded-none text-[#6CADF5] hover:bg-white/5 font-medium"
                >
                  View
                </Button>

                {m.moveStatus === STOCK_MOVE_STATUS.REQUESTED && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => handleEdit(m)}
                      className="h-8 px-2 text-xs rounded-none text-[#A77DFF] hover:bg-white/5 font-medium"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleDelete(m._id)}
                      className="h-8 px-2 text-xs rounded-none text-[#F56868] hover:bg-white/5 font-medium"
                    >
                      Delete
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </TableContainer>
  );
}
