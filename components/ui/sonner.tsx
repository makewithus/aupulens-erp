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
            "group toast !bg-background !text-foreground !border-border/40 !shadow-none !rounded-none !border !p-4",
          title: "!font-medium !text-sm !tracking-tight !text-foreground",
          description: "!text-muted-foreground !font-mono !text-[11px] !uppercase !tracking-[0.05em]",
          actionButton:
            "group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:!rounded-none group-[.toast]:!font-mono group-[.toast]:!text-[11px] group-[.toast]:!uppercase group-[.toast]:!tracking-[0.15em]",
          cancelButton:
            "group-[.toast]:!bg-muted group-[.toast]:!text-muted-foreground group-[.toast]:!rounded-none group-[.toast]:!font-mono group-[.toast]:!text-[11px] group-[.toast]:!uppercase group-[.toast]:!tracking-[0.15em]",
          success:
            "!bg-background !border-border/40 [&>[data-icon]]:!text-[#8AE06C] !text-foreground !rounded-none",
          error:
            "!bg-background !border-border/40 [&>[data-icon]]:!text-[#F56868] !text-foreground !rounded-none",
          warning:
            "!bg-background !border-border/40 [&>[data-icon]]:!text-[#F1DF38] !text-foreground !rounded-none",
          info:
            "!bg-background !border-border/40 [&>[data-icon]]:!text-[#6CADF5] !text-foreground !rounded-none",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
