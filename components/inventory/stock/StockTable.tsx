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
  consu: "text-[#6CADF5]",
  service: "text-[#A77DFF]",
  storable: "text-[#8AE06C]",
};

interface StockTableProps {
  products: any[];
  stockMap: Record<string, number>;
  handleOpenStockUpdate: (product: any) => void;
  handleOpenView: (product: any) => void;
  handleOpenEdit: (product: any) => void;
  handleDelete: (id: string) => void;
}

export function StockTable({
  products,
  stockMap,
  handleOpenStockUpdate,
  handleOpenView,
  handleOpenEdit,
  handleDelete,
}: StockTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Product</TableHeaderCell>
          <TableHeaderCell className="text-left">Type</TableHeaderCell>
          <TableHeaderCell className="text-right">Cost</TableHeaderCell>
          <TableHeaderCell className="text-right">Price</TableHeaderCell>
          <TableHeaderCell className="text-right">On Hand</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {products.map((p) => (
          <TableRow key={p._id}>
            {/* Product details */}
            <TableCell className="font-medium">
              <div>
                <div className="font-bold text-sm text-foreground">
                  {p.header.name}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                  {p.tab_general_information?.default_code || "No Code"}
                </div>
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
                  ${TYPE_COLORS[p.tab_general_information?.type] ?? "text-muted-foreground"}
                `}
              >
                {p.tab_general_information?.type || "unknown"}
              </Badge>
            </TableCell>

            {/* Cost */}
            <TableCell className="text-right font-mono text-sm text-muted-foreground">
              ₹{(p.tab_general_information?.standard_price ?? 0).toLocaleString()}
            </TableCell>

            {/* Price */}
            <TableCell className="text-right font-mono text-sm text-foreground">
              ₹{(p.tab_general_information?.list_price ?? 0).toLocaleString()}
            </TableCell>

            {/* On Hand */}
            <TableCell className="text-right font-mono text-sm font-bold text-foreground">
              {p.tab_general_information?.type === "service"
                ? "—"
                : (stockMap[p._id] ?? 0)}
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1">
              <Button
                variant="ghost"
                onClick={() => handleOpenStockUpdate(p)}
                disabled={p.tab_general_information?.type === "service"}
                className="h-8 px-2 text-xs rounded-none text-[#F1DF38] hover:bg-white/5 font-medium disabled:opacity-30 disabled:pointer-events-none"
              >
                Stock
              </Button>

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
                onClick={() => handleDelete(p._id)}
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
