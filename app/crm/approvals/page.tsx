import { ClipboardCheck } from "lucide-react";
import { ModuleComingSoon } from "@/components/shared/ModuleComingSoon";

export default function ApprovalsPage() {
  return (
    <ModuleComingSoon
      icon={ClipboardCheck}
      title="Approvals"
      description="CRM approval workflows are on the roadmap. Check back soon, or contact your administrator for approvals you need today."
    />
  );
}
