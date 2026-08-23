'use client';

import { useEffect, useRef } from 'react';
import { useThemeStore } from '@/store/themeStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((state) => state.theme);
  const isFirstRun = useRef(true);

  useEffect(() => {
    const root = window.document.documentElement;
    const apply = () => {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    };

    // The blocking inline script in <head> (see app/layout.tsx) already set
    // the correct class before hydration — nothing to animate on first run.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      apply();
      return;
    }

    // Every component previously flipped colors on its own CSS transition
    // (duration-300/500/1000, etc.), so a toggle looked like a cascade of
    // components repainting "block by block" instead of one uniform switch.
    // Freeze all transitions for the duration of the flip, and — where the
    // browser supports it — let the View Transitions API cross-fade the
    // whole page in a single paint instead.
    root.classList.add('theme-transitioning');
    const release = () => root.classList.remove('theme-transitioning');
    const startViewTransition = (document as any).startViewTransition?.bind(document);

    if (startViewTransition) {
      const transition = startViewTransition(() => apply());
      Promise.resolve(transition.finished).finally(release);
    } else {
      apply();
      requestAnimationFrame(() => requestAnimationFrame(release));
    }
  }, [theme]);

  return <>{children}</>;
}
