import { ReactNode } from "react";

export function TableContainer({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`overflow-x-auto ${className}`} {...props}>
      <table className="w-full">
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
    <th className={`px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 ${className}`} {...props}>
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
    <td className={`px-8 py-7 ${className}`} {...props}>
      {children}
    </td>
  );
}
