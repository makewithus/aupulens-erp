import { Settings } from "lucide-react";
import { ModuleComingSoon } from "@/components/shared/ModuleComingSoon";

export default function SettingsPage() {
  return (
    <ModuleComingSoon
      icon={Settings}
      title="CRM Settings"
      description="Module-wide CRM configuration is on the roadmap. Check back soon, or contact your administrator for the settings you need today."
    />
  );
}
