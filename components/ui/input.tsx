import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onKeyDown, onChange, min, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-none border border-input bg-transparent px-3 py-1 text-base text-foreground -sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        min={type === "number" && min === undefined ? "0" : min}
        onKeyDown={(e) => {
          if (type === "number" && (e.key === "-" || e.key === "e" || e.key === "E")) {
            e.preventDefault();
          }
          if (onKeyDown) onKeyDown(e);
        }}
        onChange={(e) => {
          if (type === "number" && parseFloat(e.target.value) < 0) {
            e.target.value = "0";
          }
          if (onChange) onChange(e);
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
