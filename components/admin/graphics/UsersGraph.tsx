"use client";

export function UsersGraph() {
  return (
    <svg
      viewBox="0 0 140 140"
      className="h-28 w-28 opacity-20"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="1">
        <line x1="25" y1="30" x2="70" y2="18">
          <animate
            attributeName="opacity"
            values="0.2;1;0.2"
            dur="6s"
            repeatCount="indefinite"
          />
        </line>

        <line x1="70" y1="18" x2="108" y2="42" />
        <line x1="108" y1="42" x2="88" y2="92" />
        <line x1="88" y1="92" x2="40" y2="105" />
        <line x1="40" y1="105" x2="25" y2="30" />
      </g>

      {[
        [25,30],
        [70,18],
        [108,42],
        [88,92],
        [40,105],
      ].map(([cx,cy],i)=>(
        <circle key={i} cx={cx} cy={cy} r="2.5" fill="currentColor">
          <animate
            attributeName="r"
            values="2;3.5;2"
            dur={`${4+i}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </svg>
  );
}