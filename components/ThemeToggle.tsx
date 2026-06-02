'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/store/themeStore';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        'relative h-9 w-9 rounded-none transition-all duration-300',
        'hover:bg-accent hover:shadow-sm hover:scale-105',
        'overflow-hidden'
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {/* Sun Icon */}
      <Sun
        className={cn(
          'absolute h-[1.1rem] w-[1.1rem] transition-all duration-500',
          isDark
            ? 'rotate-90 scale-0 opacity-0'
            : 'rotate-0 scale-100 opacity-100 text-amber-500'
        )}
      />

      {/* Moon Icon */}
      <Moon
        className={cn(
          'absolute h-[1.1rem] w-[1.1rem] transition-all duration-500',
          isDark
            ? 'rotate-0 scale-100 opacity-100 text-indigo-400'
            : '-rotate-90 scale-0 opacity-0'
        )}
      />

      {/* Subtle glow effect */}
      <span
        className={cn(
          'absolute inset-0 rounded-none transition-all duration-500',
          isDark
            ? 'bg-indigo-500/10 blur-xl opacity-50'
            : 'bg-amber-500/10 blur-xl opacity-50'
        )}
        aria-hidden="true"
      />
    </Button>
  );
}
