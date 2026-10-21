import { ReactNode } from "react";

export function TableContainer({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`overflow-x-auto w-full ${className}`} {...props}>
      <table className="w-full min-w-[600px]">
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children, className = "", ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`border-b border-border/40 ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableHeaderCell({ children, className = "", ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-4 sm:px-6 lg:px-8 py-4 sm:py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground ${className}`} {...props}>
      {children}
    </th>
  );
}

export function TableRow({ children, className = "", ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`group transition-colors duration-300 hover:bg-white/[0.015] ${className}`} {...props}>
      {children}
    </tr>
  );
}

export function TableBody({ children, className = "", ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-border/30 ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function TableCell({ children, className = "", ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 sm:px-6 lg:px-8 py-4 sm:py-6 ${className}`} {...props}>
      {children}
    </td>
  );
}
