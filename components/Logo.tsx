"use client";

import Image from "next/image";
import { useThemeStore } from "@/store/themeStore";
import { useEffect, useState } from "react";

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}

export function Logo({
  width = 112,
  height = 32,
  className,
  priority = false,
}: LogoProps) {
  const theme = useThemeStore((state) => state.theme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use a stable default during server rendering and hydration.
  // Since the default theme is dark, use logo-white(1).png.
  const isDark = !mounted || theme === "dark";
  const [hasError, setHasError] = useState(false);
  const logoSrc = isDark ? "/logo-white.png" : "/logo-dark.png";

  if (hasError) {
    return (
      <span className={`font-mono font-bold tracking-tight text-lg select-none inline-flex items-center ${isDark ? "text-white" : "text-slate-900"} ${className || ""}`}>
        aupulens
      </span>
    );
  }

  return (
    <>
      <Image
        src={logoSrc}
        alt="Aupulens"
        width={width}
        height={height}
        priority={priority}
        unoptimized
        onError={() => setHasError(true)}
        className={`${className || ""} print:hidden`}
      />
      <img
        src="/logo-dark.png"
        alt="Aupulens"
        width={width}
        height={height}
        className={`${className || ""} hidden print:block`}
      />
    </>
  );
}
