"use client";

import { useParams } from "next/navigation";
import { BankingRuleForm } from "@/components/finance/accounting/BankingRuleForm";

export default function EditBankingRulePage() {
  const params = useParams<{ id: string }>();
  return <BankingRuleForm ruleId={params.id} />;
}
