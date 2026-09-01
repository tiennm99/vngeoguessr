import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThemeToggle from '../components/ThemeToggle';
import DebugNav from './DebugNav';

// One shell for every debug page, styled like the game screen's app bar, so
// the hub and both tools share identical chrome and only differ in content.
// The column is viewport-height with the scroll INSIDE <main>: document-style
// pages (hub, bbox) scroll there, while the coverage map takes h-full and
// manages its own panes.
export default function DebugLayout({ children }) {
  return (
    <div className="flex h-dvh flex-col vn-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-sm sm:px-4">
        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            aria-label="Back to home"
            className="min-h-11 text-muted-foreground hover:text-foreground"
          >
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </Button>
          <span className="text-sm font-bold text-foreground">Debug</span>
        </div>

        <DebugNav />

        <ThemeToggle />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
