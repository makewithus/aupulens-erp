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

interface BillsTableProps {
  filteredBills: any[];
  handleOpenEdit: (bill: any) => void;
  handleDelete: (id: string) => Promise<void>;
  handleGenerateInvoiceFromBill: (bill: any) => void;
}

export function BillsTable({
  filteredBills,
  handleOpenEdit,
  handleDelete,
  handleGenerateInvoiceFromBill,
}: BillsTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Number</TableHeaderCell>
          <TableHeaderCell className="text-left">Vendor</TableHeaderCell>
          <TableHeaderCell className="text-left">Bill Date</TableHeaderCell>
          <TableHeaderCell className="text-left">Due Date</TableHeaderCell>
          <TableHeaderCell className="text-right">Total</TableHeaderCell>
          <TableHeaderCell className="text-center">Status</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filteredBills.map((bill) => (
          <TableRow key={bill._id} onClick={() => handleOpenEdit(bill)}>
            {/* Number */}
            <TableCell>
              <div className="font-mono text-sm font-semibold text-foreground">{bill.name}</div>
              {bill.sourceDocument && (
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {bill.sourceDocument}
                </div>
              )}
            </TableCell>

            {/* Vendor */}
            <TableCell className="text-sm font-medium text-foreground">
              {bill.partnerId?.header?.name || "No Vendor"}
            </TableCell>

            {/* Bill Date */}
            <TableCell className="text-sm text-muted-foreground font-mono">
              {new Date(bill.invoiceDate).toLocaleDateString()}
            </TableCell>

            {/* Due Date */}
            <TableCell className="text-sm text-muted-foreground font-mono">
              {new Date(bill.dueDate).toLocaleDateString()}
            </TableCell>

            {/* Total */}
            <TableCell className="text-right font-mono text-sm font-semibold text-foreground">
              {bill.currencyId} {bill.amountTotal?.toLocaleString()}
            </TableCell>

            {/* Status */}
            <TableCell className="text-center">
              <div className="flex flex-col items-center gap-0.5">
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
                    ${STATE_COLORS[bill.state] ?? "text-muted-foreground"}
                  `}
                >
                  {(bill.state || "").toLowerCase()}
                </Badge>
                {bill.manualReviewRequired && (
                  <span className="text-[9px] font-mono font-bold uppercase tracking-tight text-[#F56868]">
                    manual review
                  </span>
                )}
              </div>
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                onClick={() => handleOpenEdit(bill)}
                className="h-8 px-2 text-xs rounded-none text-[#6CADF5] hover:bg-white/5 font-medium"
              >
                View
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleGenerateInvoiceFromBill(bill)}
                className="h-8 px-2 text-xs rounded-none text-[#A77DFF] hover:bg-white/5 font-medium"
              >
                Gen Invoice
              </Button>

              {bill.state === "draft" && (
                <Button
                  variant="ghost"
                  onClick={() => handleDelete(bill._id)}
                  className="h-8 px-2 text-xs rounded-none text-[#F56868] hover:bg-white/5 font-medium"
                >
                  Delete
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableContainer>
  );
}
