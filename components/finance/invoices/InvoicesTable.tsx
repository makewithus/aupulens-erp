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

const STATE_COLORS: Record<string, string> = {
  draft: "text-muted-foreground/60",
  pending_approval: "text-[#A77DFF]",
  approved: "text-[#6CADF5]",
  posted: "text-[#8AE06C]",
  cancel: "text-[#F56868]",
};

interface InvoicesTableProps {
  filtered: any[];
  handleOpenView: (invoice: any) => void;
}

export function InvoicesTable({
  filtered,
  handleOpenView,
}: InvoicesTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Number</TableHeaderCell>
          <TableHeaderCell className="text-left">Customer</TableHeaderCell>
          <TableHeaderCell className="text-left">Source</TableHeaderCell>
          <TableHeaderCell className="text-left">Date</TableHeaderCell>
          <TableHeaderCell className="text-left">Total</TableHeaderCell>
          <TableHeaderCell className="text-left">Status</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filtered.map((inv) => (
          <TableRow key={inv._id}>
            {/* Number */}
            <TableCell className="font-mono text-sm font-semibold text-foreground">
              {inv.name}
            </TableCell>

            {/* Customer */}
            <TableCell className="text-sm text-muted-foreground">
              {inv.partnerId?.header?.name || inv.partnerId?.name || "Unknown"}
            </TableCell>

            {/* Source */}
            <TableCell className="font-mono text-xs text-muted-foreground">
              {inv.sourceDocument || "—"}
            </TableCell>

            {/* Date */}
            <TableCell className="font-mono text-sm text-muted-foreground">
              {inv.invoiceDate
                ? new Date(inv.invoiceDate).toLocaleDateString()
                : "—"}
            </TableCell>

            {/* Total */}
            <TableCell className="font-mono text-sm font-semibold text-foreground">
              ₹{inv.amountTotal?.toLocaleString() ?? 0}
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
                  ${STATE_COLORS[inv.state] ?? "text-muted-foreground"}
                `}
              >
                {(inv.state || "").toLowerCase()}
              </Badge>
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1">
              <Button
                variant="ghost"
                onClick={() =>
                  window.open(
                    `/sales/invoices/print/${inv._id}`,
                    "_blank",
                  )
                }
                className="h-8 px-2 text-xs rounded-none text-[#A77DFF] hover:bg-white/5 font-medium"
              >
                Print
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleOpenView(inv)}
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
