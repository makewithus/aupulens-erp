import {
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/shared/Table";
import { Button } from "@/components/ui/button";

interface PricelistTableProps {
  filtered: any[];
  handleOpenView: (item: any) => void;
  handleOpenEdit: (item: any) => void;
  handleDeleteClick: (id: string, name: string) => void;
}

export function PricelistTable({
  filtered,
  handleOpenView,
  handleOpenEdit,
  handleDeleteClick,
}: PricelistTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Name</TableHeaderCell>
          <TableHeaderCell className="text-left">Currency</TableHeaderCell>
          <TableHeaderCell className="text-left">Rules</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filtered.map((p) => (
          <TableRow key={p._id}>
            {/* Name */}
            <TableCell className="font-medium text-foreground">
              {p.name}
            </TableCell>

            {/* Currency */}
            <TableCell className="text-sm font-mono text-muted-foreground">
              {p.currencyId}
            </TableCell>

            {/* Rules */}
            <TableCell className="text-sm text-muted-foreground">
              {p.items?.length || 0} rule(s)
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1">
              <Button
                variant="ghost"
                onClick={() => handleOpenView(p)}
                className="h-8 px-2 text-xs rounded-none text-[#6CADF5] hover:bg-white/5 font-medium"
              >
                View
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleOpenEdit(p)}
                className="h-8 px-2 text-xs rounded-none text-[#A77DFF] hover:bg-white/5 font-medium"
              >
                Edit
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleDeleteClick(p._id, p.name)}
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
