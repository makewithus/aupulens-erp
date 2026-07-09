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
  Printer,
  Eye,
  Edit2,
  CheckCircle2,
  Trash2,
} from "lucide-react";

// ERP Palette Color Maps
const STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground/60",
  posted: "text-[#8AE06C]",      // Green
  cancel: "text-[#F56868]",      // Red
};

interface ProformaInvoiceTableProps {
  filtered: any[];
  handlePrintInvoice: (invoice: any) => Promise<void>;
  handleOpenView: (invoice: any) => void;
  handleOpenEdit: (invoice: any) => void;
  handleConfirmInvoice: (id: string) => Promise<void>;
  handleDelete: (id: string) => void;
}

export function ProformaInvoiceTable({
  filtered,
  handlePrintInvoice,
  handleOpenView,
  handleOpenEdit,
  handleConfirmInvoice,
  handleDelete,
}: ProformaInvoiceTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Invoice #</TableHeaderCell>
          <TableHeaderCell className="text-left">Customer</TableHeaderCell>
          <TableHeaderCell className="text-left">Total</TableHeaderCell>
          <TableHeaderCell className="text-left">Status</TableHeaderCell>
          <TableHeaderCell className="text-left">Date</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filtered.map((inv) => (
          <TableRow key={inv._id}>
            {/* Invoice # */}
            <TableCell className="font-mono text-sm text-foreground">
              {inv.name}
            </TableCell>

            {/* Customer */}
            <TableCell className="text-sm text-muted-foreground">
              {inv.partnerId?.header?.name || "Unknown"}
            </TableCell>

            {/* Total */}
            <TableCell className="font-mono font-medium text-sm text-foreground">
              ₹{inv.amountTotal?.toLocaleString() || 0}
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
                  ${STATUS_COLORS[inv.state] ?? "text-muted-foreground"}
                `}
              >
                {inv.state}
              </Badge>
            </TableCell>

            {/* Date */}
            <TableCell className="text-sm text-muted-foreground">
              {new Date(inv.invoiceDate).toLocaleDateString()}
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handlePrintInvoice(inv)}
                title="Print Invoice"
                className="h-8 w-8 rounded-none text-[#A77DFF] hover:bg-white/5"
              >
                <Printer className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleOpenView(inv)}
                title="View Invoice"
                className="h-8 w-8 rounded-none text-[#6CADF5] hover:bg-white/5"
              >
                <Eye className="h-4 w-4" />
              </Button>

              {inv.state === "draft" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(inv)}
                    title="Edit Invoice"
                    className="h-8 w-8 rounded-none text-[#A77DFF] hover:bg-white/5"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleConfirmInvoice(inv._id)}
                    title="Confirm Invoice"
                    className="h-8 w-8 rounded-none text-[#8AE06C] hover:bg-white/5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(inv._id)}
                    title="Delete Invoice"
                    className="h-8 w-8 rounded-none text-[#F56868] hover:bg-white/5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableContainer>
  );
}
