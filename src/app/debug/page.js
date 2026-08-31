"use client";

import Link from 'next/link';
import { ArrowRight, Map, ScanSearch } from 'lucide-react';

// Every debug tool, one card each, all at the same level. The hub owns
// /debug; each tool lives one segment below it and the shared layout's
// DebugNav keeps every page one click from any other.
const TOOLS = [
  {
    href: '/debug/coverage',
    icon: Map,
    name: 'Panorama coverage map',
    description:
      'Every indexed panorama in a region, drawn over its boundary. Click a dot to open the picture.',
  },
  {
    href: '/debug/bbox',
    icon: ScanSearch,
    name: 'Bbox & Mapillary tester',
    description:
      'Visualize a bounding box on the map and probe the live Mapillary API for imagery inside it.',
  },
];

export default function DebugHubPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">Debug Tools</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Diagnostics for the panorama index and its data sources
      </p>

      <div className="grid gap-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-150 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand-subtle-foreground">
                <tool.icon className="size-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold text-foreground transition-colors group-hover:text-brand">
                  {tool.name}
                </span>
                <span className="block text-sm text-muted-foreground">{tool.description}</span>
              </span>
            </span>
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
