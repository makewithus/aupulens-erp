"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Module {
  id: string;
  title: string;
  href: string;
}

interface ModuleTabsProps {
  modules: Module[];
  activeModule: string;
  onNavigate: (href: string) => void;
}

export function ModuleTabs({
  modules,
  activeModule,
  onNavigate,
}: ModuleTabsProps) {
  return (
    <nav className="hidden lg:flex items-center gap-10 ml-12">
      {modules.map((module) => {
        const isActive = module.id === activeModule;

        return (
          <button
            key={module.id}
            onClick={() => onNavigate(module.href)}
            className={cn(
              "group relative flex items-center py-3 transition-all duration-300",
              isActive
                ? "text-foreground"
                : "text-muted-foreground/80 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "relative text-[16px] font-medium tracking-[-0.04em] transition-all duration-300",
                isActive
                  ? "opacity-100"
                  : "opacity-100 group-hover:opacity-100"
              )}
            >
              {module.title}
            </span>

            {isActive && (
              <motion.div
                layoutId="module-indicator"
                className="absolute bottom-2 left-0 right-0 mx-auto h-[2px] w-full rounded-full bg-primary"
                transition={{
                  type: "spring",
                  stiffness: 450,
                  damping: 36,
                  mass: 0.7,
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}