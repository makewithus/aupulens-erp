"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a fixed-width HTML fragment (an A4-width invoice/quote print template)
 * scaled to fit its container's width — so the full page is legible and crisp
 * instead of overflowing or being clipped. Height follows the scaled content, so
 * the whole document shows. Re-scales on container resize and whenever `html`
 * changes (the Print-Format Builder's live preview updates as options change).
 *
 * The HTML is server-rendered from the tenant's own escaped data (same fragment
 * as the PDF), so injecting it directly is safe here.
 */
export function ScaledHtmlPreview({
  html,
  baseWidth = 794, // A4 width at 96dpi
  className,
}: {
  html: string;
  baseWidth?: number;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / baseWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth]);

  useEffect(() => {
    if (innerRef.current) setHeight(innerRef.current.scrollHeight * scale);
  }, [html, scale]);

  return (
    <div ref={outerRef} className={className} style={{ height, overflow: "hidden" }}>
      <div
        ref={innerRef}
        className="origin-top-left"
        style={{ width: baseWidth, transform: `scale(${scale})` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export default ScaledHtmlPreview;
