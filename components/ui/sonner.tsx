"use client";

import { useThemeStore } from "@/store/themeStore";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeStore((state) => state.theme);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border/40 group-[.toaster]:shadow-xl group-[.toaster]:!rounded-none group-[.toaster]:border group-[.toaster]:p-4",
          title: "font-medium text-sm tracking-tight text-foreground",
          description: "group-[.toast]:text-muted-foreground font-mono text-[11px] uppercase tracking-[0.05em]",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:!rounded-none group-[.toast]:font-mono group-[.toast]:text-[11px] group-[.toast]:uppercase group-[.toast]:tracking-[0.15em]",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:!rounded-none group-[.toast]:font-mono group-[.toast]:text-[11px] group-[.toast]:uppercase group-[.toast]:tracking-[0.15em]",
          success:
            "group-[.toaster]:bg-background group-[.toaster]:border-border/40 [&>[data-icon]]:text-[#8AE06C] group-[.toaster]:text-foreground",
          error:
            "group-[.toaster]:bg-background group-[.toaster]:border-border/40 [&>[data-icon]]:text-[#F56868] group-[.toaster]:text-foreground",
          warning:
            "group-[.toaster]:bg-background group-[.toaster]:border-border/40 [&>[data-icon]]:text-[#F1DF38] group-[.toaster]:text-foreground",
          info:
            "group-[.toaster]:bg-background group-[.toaster]:border-border/40 [&>[data-icon]]:text-[#6CADF5] group-[.toaster]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
