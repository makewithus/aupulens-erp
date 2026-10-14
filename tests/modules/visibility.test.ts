import { describe, expect, it } from "vitest";
import {
  filterSidebarSections,
  moduleForHref,
  normalizeModuleList,
} from "@/lib/modules/visibility";

describe("tenant module visibility", () => {
  it("normalizes the project/projects entitlement spelling", () => {
    expect(normalizeModuleList(["CRM", "projects", "project", "unknown"])).toEqual(["crm", "project"]);
  });

  it("maps module links, calendar query links, and admin workspace links", () => {
    expect(moduleForHref("/crm/leads")).toBe("crm");
    expect(moduleForHref("/calendar?module=inventory")).toBe("inventory");
    expect(moduleForHref("/migration")).toBe("admin");
  });

  it("removes disabled module links while keeping enabled admin links", () => {
    const sections = [
      {
        title: "Workspace",
        items: [
          { title: "Dashboard", href: "/admin/dashboard" },
          { title: "CRM automations", href: "/crm/automations" },
          { title: "Inventory", href: "/inventory/summary" },
        ],
      },
    ];

    expect(filterSidebarSections(sections, ["admin", "crm"])).toEqual([
      {
        title: "Workspace",
        items: [
          { title: "Dashboard", href: "/admin/dashboard" },
          { title: "CRM automations", href: "/crm/automations" },
        ],
      },
    ]);
  });
});
