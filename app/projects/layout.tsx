"use client";

import { PersistentModuleShell } from "@/components/dashboard/PersistentModuleShell";
import { ProjectsRouteDataPrefetcher } from "@/components/projects/ProjectsRouteDataPrefetcher";
import { projectsSidebarConfig } from "@/config/sidebar/projects";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersistentModuleShell
      sidebarSections={projectsSidebarConfig}
      moduleLabel="Projects"
      rootHref="/projects/dashboard"
      profilePath="/admin/profile"
      extras={<ProjectsRouteDataPrefetcher />}
    >
      {children}
    </PersistentModuleShell>
  );
}
