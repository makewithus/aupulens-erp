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
  FileText,
  Eye,
  Edit2,
  Trash2,
  Send,
  Plus,
  ArrowRight,
} from "lucide-react";
import {
  Q2C_STATUS,
  Q2C_STATUS_LABELS,
  getNextQ2CStatuses,
  type Q2CStatus,
} from "@/lib/constants/statuses";

// ERP Palette Color Maps
const STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground/60",
  sent: "text-[#6CADF5]",       // Blue
  sale: "text-[#8AE06C]",       // Green
  cancel: "text-[#F56868]",     // Red
};

const Q2C_STATUS_COLORS_REDESIGNED: Record<Q2CStatus, string> = {
  [Q2C_STATUS.LEAD]: "text-[#6CADF5]",
  [Q2C_STATUS.OPPORTUNITY]: "text-[#F1DF38]",
  [Q2C_STATUS.PRICE_APPLIED]: "text-[#8AE06C]",
  [Q2C_STATUS.QUOTE_GENERATED]: "text-[#A77DFF]",
  [Q2C_STATUS.DISCOUNT_APPROVAL]: "text-[#F1DF38]",
  [Q2C_STATUS.QUOTE_ACCEPTED]: "text-[#8AE06C]",
  [Q2C_STATUS.SALES_ORDER]: "text-[#6CADF5]",
  [Q2C_STATUS.FULFILLMENT]: "text-[#F1DF38]",
  [Q2C_STATUS.INVOICE_POSTED]: "text-[#A77DFF]",
  [Q2C_STATUS.REVENUE_RECOGNIZED]: "text-[#8AE06C]",
  [Q2C_STATUS.LOST]: "text-[#F56868]",
  [Q2C_STATUS.CANCELLED]: "text-muted-foreground/60",
};

interface QuotationTableProps {
  filtered: any[];
  handleQ2CTransition: (id: string, nextStatus: string) => Promise<void>;
  handleViewInvoice: (invoiceId: string) => Promise<void>;
  handleCreateInvoice: (orderId: string) => Promise<void>;
  handleOpenView: (order: any) => void;
  handleOpenEdit: (order: any) => void;
  handleAction: (id: string, action: string) => Promise<void>;
  handleDelete: (id: string) => void;
}

export function QuotationTable({
  filtered,
  handleQ2CTransition,
  handleViewInvoice,
  handleCreateInvoice,
  handleOpenView,
  handleOpenEdit,
  handleAction,
  handleDelete,
}: QuotationTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Reference</TableHeaderCell>
          <TableHeaderCell className="text-left">Customer</TableHeaderCell>
          <TableHeaderCell className="text-left">Total</TableHeaderCell>
          <TableHeaderCell className="text-left">Status</TableHeaderCell>
          <TableHeaderCell className="text-left">Q2C Stage</TableHeaderCell>
          <TableHeaderCell className="text-left">Date</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filtered.map((q) => {
          const q2c = q.q2cStatus || Q2C_STATUS.LEAD;
          const nextStatuses = getNextQ2CStatuses(q2c);
          const forwardNext = nextStatuses.find(
            (s) => s !== Q2C_STATUS.LOST && s !== Q2C_STATUS.CANCELLED,
          );

          return (
            <TableRow key={q._id}>
              {/* Reference */}
              <TableCell className="font-mono text-sm text-foreground">
                {q.header.name}
              </TableCell>

              {/* Customer */}
              <TableCell className="text-sm text-muted-foreground">
                {q.header.partnerId?.header?.name || "Unknown"}
              </TableCell>

              {/* Total */}
              <TableCell className="font-mono font-medium text-sm text-foreground">
                ₹{q.totals.amountTotal.toLocaleString()}
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
                    uppercase
                    tracking-[0.12em]
                    hover:bg-transparent
                    shadow-none
                    ${STATUS_COLORS[q.status] ?? "text-muted-foreground"}
                  `}
                >
                  {q.status}
                </Badge>
              </TableCell>

              {/* Q2C Stage */}
              <TableCell>
                <div className="flex items-center gap-1.5">
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
                      ${Q2C_STATUS_COLORS_REDESIGNED[q2c as Q2CStatus] ?? "text-muted-foreground"}
                    `}
                  >
                    {Q2C_STATUS_LABELS[q2c as Q2CStatus] || q2c}
                  </Badge>
                  {forwardNext && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-white/5 rounded-none text-[#6CADF5]"
                      onClick={() => handleQ2CTransition(q._id, forwardNext)}
                      title={`Advance to ${Q2C_STATUS_LABELS[forwardNext]}`}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </TableCell>

              {/* Date */}
              <TableCell className="text-sm text-muted-foreground">
                {new Date(q.createdAt).toLocaleDateString()}
              </TableCell>

              {/* Actions */}
              <TableCell className="text-right whitespace-nowrap space-x-1">
                {q.status !== "cancel" &&
                  (q.invoiceIds && q.invoiceIds.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleViewInvoice(q.invoiceIds[0])}
                      title="View Invoice"
                      className="h-8 w-8 rounded-none text-[#A77DFF] hover:bg-white/5"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCreateInvoice(q._id)}
                      title="Create Invoice"
                      className="h-8 w-8 rounded-none text-[#F1DF38] hover:bg-white/5"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  ))}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleOpenView(q)}
                  title="View Quotation"
                  className="h-8 w-8 rounded-none text-[#6CADF5] hover:bg-white/5"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                
                {q.status === "draft" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(q)}
                    title="Edit Quotation"
                    className="h-8 w-8 rounded-none text-[#A77DFF] hover:bg-white/5"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
                
                {q.status === "draft" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleAction(q._id, "sent")}
                    title="Mark as Sent"
                    className="h-8 w-8 rounded-none text-[#8AE06C] hover:bg-white/5"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
                
                {q.status !== "cancel" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleAction(q._id, "sale")}
                    title="Confirm Order"
                    className="h-8 w-8 rounded-none text-[#6CADF5] hover:bg-white/5"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
                
                {(q.status === "draft" || q.status === "cancel") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(q._id)}
                    title="Delete Quotation"
                    className="h-8 w-8 rounded-none text-[#F56868] hover:bg-white/5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </TableContainer>
  );
}

