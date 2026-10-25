import { cn } from "@/lib/utils";

interface InactiveOrbitProps {
  className?: string;
}

export function InactiveOrbit({ className }: InactiveOrbitProps = {}) {
  return (
    <svg
      viewBox="0 0 140 140"
      className={cn("h-28 w-28 text-[#F56868]/30", className)}
      fill="none"
    >
      <circle
        cx="70"
        cy="70"
        r="42"
        stroke="currentColor"
        strokeDasharray="3 5"
      />

      <circle r="3" fill="currentColor">
        <animateMotion
          dur="8s"
          repeatCount="indefinite"
          path="
            M70,28
            A42,42 0 1 1 69.9,28
          "
        />
      </circle>

      <circle r="2" fill="currentColor">
        <animateMotion
          dur="5s"
          repeatCount="indefinite"
          path="
            M70,28
            A42,42 0 1 1 69.9,28
          "
        />
      </circle>
    </svg>
  );
}