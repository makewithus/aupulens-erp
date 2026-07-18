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

const STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground/60",
  submitted: "text-[#A77DFF]",
  approved: "text-[#6CADF5]",
  posted: "text-[#8AE06C]",
  refused: "text-[#F56868]",
};

interface ExpensesTableProps {
  filteredExpenses: any[];
  handleOpenView: (expense: any) => void;
  handleDelete: (id: string) => Promise<void>;
}

export function ExpensesTable({
  filteredExpenses,
  handleOpenView,
  handleDelete,
}: ExpensesTableProps) {
  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Expense</TableHeaderCell>
          <TableHeaderCell className="text-left">Staff</TableHeaderCell>
          <TableHeaderCell className="text-left">Date</TableHeaderCell>
          <TableHeaderCell className="text-right">Total</TableHeaderCell>
          <TableHeaderCell className="text-center">Status</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filteredExpenses.map((expense) => (
          <TableRow key={expense._id}>
            {/* Expense */}
            <TableCell>
              <div className="font-bold text-sm text-foreground">{expense.description}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5 uppercase tracking-wider">
                {expense.category}
              </div>
            </TableCell>

            {/* Staff */}
            <TableCell className="text-sm font-medium text-foreground">
              {expense.employeeId?.name || "Self"}
            </TableCell>

            {/* Date */}
            <TableCell className="font-mono text-sm text-muted-foreground">
              {new Date(expense.expenseDate).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </TableCell>

            {/* Total */}
            <TableCell className="text-right font-mono text-sm font-semibold text-foreground">
              ₹ {expense.total?.toLocaleString()}
            </TableCell>

            {/* Status */}
            <TableCell className="text-center">
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
                  ${STATUS_COLORS[expense.status] ?? "text-muted-foreground"}
                `}
              >
                {(expense.status || "").toLowerCase()}
              </Badge>
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1">
              <Button
                variant="ghost"
                onClick={() => handleOpenView(expense)}
                className="h-8 px-2 text-xs rounded-none text-[#6CADF5] hover:bg-white/5 font-medium"
              >
                View
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleDelete(expense._id)}
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
