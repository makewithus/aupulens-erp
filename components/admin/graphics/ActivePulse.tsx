"use client";

export function ActivePulse() {
  return (
    <svg
      viewBox="0 0 140 140"
      className="h-28 w-28 text-[#8AE06C]/30"
      fill="none"
    >
      {[18,34,50].map((r, i) => (
        <circle
          key={r}
          cx="70"
          cy="70"
          r={r}
          stroke="currentColor"
          strokeWidth="1"
        >
          <animate
            attributeName="opacity"
            values="0;0.6;0"
            dur="4s"
            begin={`${i}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      <circle cx="70" cy="70" r="4" fill="currentColor">
        <animate
          attributeName="r"
          values="4;5;4"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}