import React from 'react';
import Link from 'next/link';

export function DashboardFooter() {
  return (
    <footer className="flex-shrink-0 bg-background border-t border-border/40 text-xs sm:text-sm text-muted-foreground uppercase font-mono tracking-widest">
      <div className="max-w-[1400px] mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-5 flex flex-col lg:flex-row items-center lg:items-center justify-center lg:justify-between gap-3 lg:gap-0">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-xs sm:text-sm justify-center lg:justify-start">
          <Link href="/submit" className="hover:text-foreground whitespace-nowrap">SUBMIT</Link>
          <span className="text-muted-foreground hidden sm:inline">|</span>
          <a href="https://discord.gg/" target="_blank" rel="noreferrer" className="hover:text-foreground">DISCORD</a>
          <span className="text-muted-foreground hidden sm:inline">|</span>
          <a href="https://twitter.com/" target="_blank" rel="noreferrer" className="hover:text-foreground">TWITTER</a>
          <span className="text-muted-foreground hidden sm:inline">|</span>
          <Link href="/blog" className="hover:text-foreground">BLOG</Link>
          <span className="text-muted-foreground hidden sm:inline">|</span>
          <Link href="/docs" className="hover:text-foreground">DOCS</Link>
          <span className="text-muted-foreground hidden sm:inline">|</span>
          <Link href="/privacy" className="hover:text-foreground">PRIVACY</Link>
          <span className="text-muted-foreground hidden sm:inline">|</span>
          <Link href="/terms" className="hover:text-foreground">TERMS</Link>
        </div>
        <div className="text-[9px] sm:text-[11px] font-medium text-muted-foreground whitespace-nowrap">AUPULENS ERP</div>
      </div>
    </footer>
  );
}

export default DashboardFooter;
