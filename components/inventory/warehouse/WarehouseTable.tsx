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

const TYPE_COLORS: Record<string, string> = {
  standard: "text-[#6CADF5]",
  transit: "text-[#A77DFF]",
  virtual: "text-[#8AE06C]",
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-[#8AE06C]",
  inactive: "text-muted-foreground/60",
};

interface WarehouseTableProps {
  filtered: any[];
  handleOpenView: (wh: any) => void;
  handleOpenEdit: (wh: any) => void;
  setDeleteId: (id: string) => void;
}

export function WarehouseTable({
  filtered,
  handleOpenView,
  handleOpenEdit,
  setDeleteId,
}: WarehouseTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Code</TableHeaderCell>
          <TableHeaderCell className="text-left">Name</TableHeaderCell>
          <TableHeaderCell className="text-left">Location</TableHeaderCell>
          <TableHeaderCell className="text-left">Type</TableHeaderCell>
          <TableHeaderCell className="text-left">Status</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filtered.map((w) => (
          <TableRow key={w._id}>
            {/* Code */}
            <TableCell className="font-mono text-xs text-muted-foreground">
              {w.warehouseCode}
            </TableCell>

            {/* Name */}
            <TableCell className="text-sm font-medium text-foreground">
              {w.name}
            </TableCell>

            {/* Location */}
            <TableCell className="text-sm text-muted-foreground">
              {w.location}
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
                  ${TYPE_COLORS[w.type] ?? "text-muted-foreground"}
                `}
              >
                {w.type}
              </Badge>
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
                  ${STATUS_COLORS[w.status] ?? "text-muted-foreground"}
                `}
              >
                {w.status}
              </Badge>
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1">
              <Button
                variant="ghost"
                onClick={() => handleOpenView(w)}
                className="h-8 px-2 text-xs rounded-none text-[#6CADF5] hover:bg-white/5 font-medium"
              >
                View
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleOpenEdit(w)}
                className="h-8 px-2 text-xs rounded-none text-[#A77DFF] hover:bg-white/5 font-medium"
              >
                Edit
              </Button>

              <Button
                variant="ghost"
                onClick={() => setDeleteId(w._id)}
                className="h-8 px-2 text-xs rounded-none text-[#F56868] hover:bg-white/5 font-medium"
              >
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableContainer>
  );
}
