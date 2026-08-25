"use client";

import { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  title?: string;
  actions?: ReactNode;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  isLoading,
  emptyMessage = "No data available",
  className,
  title,
  actions,
  pagination,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className={cn("w-full space-y-4 bg-[#0c0c0c] p-6 rounded-lg", className)}
    >
      {/* Header Section */}
      {(title || actions) && (
        <div className="flex items-center justify-between mb-6">
          {title && (
            <h2 className="text-2xl font-semibold text-white tracking-tight">
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      )}

      {/* Table Section */}
      <div className="rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-white/10">
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    "text-muted-foreground font-medium h-12",
                    column.className
                  )}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, index) => (
                <TableRow
                  key={index}
                  className="border-white/10 hover:bg-white/5 transition-colors"
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn("text-foreground", column.className)}
                    >
                      {column.render
                        ? column.render(item)
                        : String(item[column.key] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Section */}
      {pagination && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
            disabled={pagination.currentPage <= 1}
            className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white min-w-[100px]"
          >
            Previous
          </Button>
          <div className="text-sm text-muted-foreground">
            Page {pagination.currentPage} of {pagination.totalPages}
          </div>
          <Button
            variant="outline"
            onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
            disabled={pagination.currentPage >= pagination.totalPages}
            className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white min-w-[100px]"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
