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

interface CustomerTableProps {
  filtered: any[];
  allCustomers: any[];
  handleOpenView: (customer: any) => void;
  handleOpenEdit: (customer: any) => void;
  handleDeleteClick: (id: string, name: string) => void;
}

export function CustomerTable({
  filtered,
  allCustomers,
  handleOpenView,
  handleOpenEdit,
  handleDeleteClick,
}: CustomerTableProps) {
  const getParentName = (parentId: string) => {
    const parent = allCustomers.find((c) => c._id === parentId);
    return parent?.header?.name || "";
  };

  return (
    <TableContainer>
      <TableHead>
        <TableRow className="hover:bg-transparent">
          <TableHeaderCell className="text-left">Customer</TableHeaderCell>
          <TableHeaderCell className="text-left">Type</TableHeaderCell>
          <TableHeaderCell className="text-left">Contact</TableHeaderCell>
          <TableHeaderCell className="text-left">Location</TableHeaderCell>
          <TableHeaderCell className="text-right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filtered.map((c) => (
          <TableRow key={c._id}>
            {/* Customer Details */}
            <TableCell>
              <div>
                <div className="text-sm font-medium text-foreground">
                  {c.header.name}
                </div>
                {c.header.parent_id && (
                  <div className="text-[10px] text-muted-foreground">
                    Member of {getParentName(c.header.parent_id)}
                  </div>
                )}
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
                  ${c.header.is_company ? "text-[#A77DFF]" : "text-[#6CADF5]"}
                `}
              >
                {c.header.is_company ? "company" : "individual"}
              </Badge>
            </TableCell>

            {/* Contact */}
            <TableCell>
              <div className="flex flex-col text-xs">
                {c.contact_details.email && (
                  <div className="text-muted-foreground">
                    {c.contact_details.email}
                  </div>
                )}
                {c.contact_details.phone && (
                  <div className="text-muted-foreground/70">
                    {c.contact_details.phone}
                  </div>
                )}
              </div>
            </TableCell>

            {/* Location */}
            <TableCell className="text-xs text-muted-foreground">
              {c.address_tab.city || "—"}
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right whitespace-nowrap space-x-1">
              <Button
                variant="ghost"
                onClick={() => handleOpenView(c)}
                className="h-8 px-2 text-xs rounded-none text-[#6CADF5] hover:bg-white/5 font-medium"
              >
                View
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleOpenEdit(c)}
                className="h-8 px-2 text-xs rounded-none text-[#A77DFF] hover:bg-white/5 font-medium"
              >
                Edit
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleDeleteClick(c._id, c.header.name)}
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
