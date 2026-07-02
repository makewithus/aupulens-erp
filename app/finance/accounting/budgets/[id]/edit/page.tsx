"use client";

import { useParams } from "next/navigation";
import { BudgetForm } from "@/components/finance/accounting/BudgetForm";

export default function EditBudgetPage() {
  const params = useParams<{ id: string }>();
  return <BudgetForm budgetId={params.id} />;
}
