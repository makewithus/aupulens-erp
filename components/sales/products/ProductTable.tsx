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

// ERP Palette Color Maps for status
const STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground/60",
  published: "text-[#8AE06C]",
};

interface ProductTableProps {
  filtered: any[];
  handleOpenView: (product: any) => void;
  handleOpenEdit: (product: any) => void;
  handleDeleteClick: (id: string, name: string) => void;
}

export function ProductTable({
  filtered,
  handleOpenView,
  handleOpenEdit,
  handleDeleteClick,
}: ProductTableProps) {
  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Product</TableHeaderCell>
          <TableHeaderCell className="text-left">Type</TableHeaderCell>
          <TableHeaderCell className="text-left">Status</TableHeaderCell>
          <TableHeaderCell className="text-left">Price</TableHeaderCell>
          <TableHeaderCell className="text-left">Cost</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filtered.map((p) => (
          <TableRow key={p._id}>
            {/* Product Name & Code */}
            <TableCell>
              <div>
                <div className="text-sm font-medium text-foreground">
                  {p.header.name}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {p.tab_general_information.default_code || "No Ref"}
                </div>
              </div>
            </TableCell>

            {/* Type */}
            <TableCell className="text-sm text-muted-foreground capitalize">
              {p.tab_general_information.type}
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
                  ${STATUS_COLORS[p.status] ?? "text-muted-foreground"}
                `}
              >
                {p.status}
              </Badge>
            </TableCell>

            {/* Price */}
            <TableCell className="font-mono text-sm text-foreground">
              {formatCurrency(p.tab_general_information.list_price || 0)}
            </TableCell>

            {/* Cost */}
            <TableCell className="font-mono text-sm text-muted-foreground">
              {formatCurrency(p.tab_general_information.standard_price || 0)}
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
                onClick={() => handleDeleteClick(p._id, p.header.name)}
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
