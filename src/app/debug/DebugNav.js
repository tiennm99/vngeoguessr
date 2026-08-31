"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Peer navigation for the debug tree: every debug page shows the same
// segmented control, so each tool is one click from any other and the
// hierarchy reads as what it is -- a flat set of equals under /debug.
// Tabs, not a dropdown: with this few destinations, hiding the peers
// behind a click would only obscure that they exist. Revisit as a
// dropdown if the toolset ever outgrows one row.
const PAGES = [
  { href: '/debug', label: 'Overview' },
  { href: '/debug/coverage', label: 'Coverage' },
  { href: '/debug/bbox', label: 'Bbox' },
];

export default function DebugNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Debug pages" className="flex overflow-hidden rounded-lg border border-border">
      {PAGES.map((page, index) => {
        const active = pathname === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring ${
              index > 0 ? 'border-l border-border' : ''
            } ${
              active
                ? 'bg-brand text-brand-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
