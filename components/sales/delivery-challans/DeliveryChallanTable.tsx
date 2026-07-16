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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-[#F1DF38]",
  issued: "text-[#6CADF5]",
  delivered: "text-[#8AE06C]",
};

interface DeliveryChallanTableProps {
  filtered: any[];
  handleOpenView: (dc: any) => void;
  handleOpenEdit: (dc: any) => void;
  handleDeleteClick: (id: string, num: string) => void;
  handleStatusUpdate: (id: string, status: string) => Promise<void>;
}

export function DeliveryChallanTable({
  filtered,
  handleOpenView,
  handleOpenEdit,
  handleDeleteClick,
  handleStatusUpdate,
}: DeliveryChallanTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">DC Number</TableHeaderCell>
          <TableHeaderCell className="text-left">Customer</TableHeaderCell>
          <TableHeaderCell className="text-left">Date</TableHeaderCell>
          <TableHeaderCell className="text-left">Status</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filtered.map((dc) => (
          <TableRow key={dc._id}>
            {/* DC Number */}
            <TableCell className="font-mono text-sm text-foreground">
              {dc.dcNumber}
            </TableCell>

            {/* Customer */}
            <TableCell className="text-sm text-muted-foreground">
              {dc.customer}
            </TableCell>

            {/* Date */}
            <TableCell className="text-sm text-muted-foreground">
              {dc.deliveryDate
                ? new Date(dc.deliveryDate).toLocaleDateString()
                : "—"}
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
                  ${STATUS_COLORS[dc.status] ?? "text-muted-foreground"}
                `}
              >
                {dc.status}
              </Badge>
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1">
              <Button
                variant="ghost"
                onClick={() => handleOpenView(dc)}
                className="h-8 px-2 text-xs rounded-none text-[#6CADF5] hover:bg-white/5 font-medium"
              >
                View
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleOpenEdit(dc)}
                className="h-8 px-2 text-xs rounded-none text-[#A77DFF] hover:bg-white/5 font-medium"
              >
                Edit
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleDeleteClick(dc._id, dc.dcNumber)}
                className="h-8 px-2 text-xs rounded-none text-[#F56868] hover:bg-white/5 font-medium"
              >
                Delete
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 px-2 text-xs rounded-none text-muted-foreground hover:bg-white/5 font-medium"
                  >
                    Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="rounded-none border-border/40"
                >
                  <DropdownMenuItem
                    disabled
                    className="font-semibold opacity-100 text-xs"
                  >
                    Set Status:
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate(dc._id, "pending")}
                    className="text-xs"
                  >
                    Mark Pending
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate(dc._id, "issued")}
                    className="text-xs"
                  >
                    Mark Issued
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate(dc._id, "delivered")}
                    className="text-xs"
                  >
                    Mark Delivered
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableContainer>
  );
}
