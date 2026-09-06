import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Reached when the [region] page rejects a code that is not in the tree --
// a typo'd or truncated shared link, mostly. Next's stock 404 is a dead end,
// and the one thing this visitor needs is the way to a region that does
// exist, so the page is mostly that link.
//
// Deliberately says nothing about which codes are valid: there are 85 of them
// and the picker is a better answer than a list.
export default function RegionNotFound() {
  return (
    <div className="flex-1 flex items-center justify-center vn-surface p-6">
      <div className="text-center space-y-4 max-w-sm animate-fade-in-up">
        {/* A real heading, not a styled <p>: a not-found page owns the whole
            document, unlike GameClient's in-place error panel, which sits
            inside a page that already has its own h1. */}
        <h1 className="text-2xl font-bold text-foreground">No such region</h1>
        <p className="text-muted-foreground text-sm">
          That link points at a region that doesn&apos;t exist. It may have been
          mistyped or cut short.
        </p>
        <Button asChild>
          <Link href="/">Pick a region</Link>
        </Button>
      </div>
    </div>
  );
}
