import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ThemeToggle from '../components/ThemeToggle';

export const metadata = {
  title: 'Credits — VNGeoGuessr',
  description: 'Data sources, licenses, and open-source software behind VNGeoGuessr',
};

// Every external link opens in a new tab and drops the referrer.
function ExternalLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  );
}

const LIBRARIES = [
  { name: 'Next.js & React', license: 'MIT', href: 'https://nextjs.org/' },
  { name: 'Leaflet', license: 'BSD-2-Clause', href: 'https://leafletjs.com/' },
  { name: 'Photo Sphere Viewer', license: 'MIT', href: 'https://photo-sphere-viewer.js.org/' },
  { name: 'Turf.js', license: 'MIT', href: 'https://turfjs.org/' },
  { name: 'shadcn/ui & Radix UI', license: 'MIT', href: 'https://ui.shadcn.com/' },
  { name: 'Tailwind CSS', license: 'MIT', href: 'https://tailwindcss.com/' },
  { name: 'Lucide', license: 'ISC', href: 'https://lucide.dev/' },
];

export default function CreditsPage() {
  return (
    <div className="min-h-dvh vn-surface">
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-10">
          <Link href="/" className="text-2xl font-bold text-foreground tracking-wider">
            VNGeoGuessr
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
              ← Home
            </Link>
          </div>
        </header>

        <h1 className="text-3xl font-extrabold text-foreground mb-8 tracking-tight">Credits &amp; Licenses</h1>

        <div className="space-y-6">
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl font-bold text-card-foreground">Street-level imagery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <a
                href="https://www.mapillary.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Mapillary"
                className="inline-block rounded-md bg-neutral-900 px-3 py-2"
              >
                <Image src="/mapillary-logo.svg" alt="Mapillary" width={122} height={28} className="h-5 w-auto" />
              </a>
              <p>
                All 360° panoramas are contributed by the{' '}
                <ExternalLink href="https://www.mapillary.com/">Mapillary</ExternalLink>{' '}
                community and licensed under{' '}
                <ExternalLink href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</ExternalLink>.
                Thank you to everyone who mapped the streets of Vietnam.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl font-bold text-card-foreground">Map data &amp; tiles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Map data ©{' '}
                <ExternalLink href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</ExternalLink>,
                available under the{' '}
                <ExternalLink href="https://opendatacommons.org/licenses/odbl/">Open Database License (ODbL)</ExternalLink>.
                {/* NEXT_PUBLIC_* is inlined at build time, so this static page
                    correctly reflects the deployed tile provider. Truthiness
                    only — the key itself must never render. */}
                {process.env.NEXT_PUBLIC_GEOAPIFY_KEY ? (
                  <> Map tiles are served by <ExternalLink href="https://www.geoapify.com/">Geoapify</ExternalLink>.</>
                ) : (
                  <> Map tiles are served by OpenStreetMap.</>
                )}
              </p>
              <p>
                Province and district boundaries are derived from OpenStreetMap
                via{' '}
                <ExternalLink href="https://nominatim.org/">Nominatim</ExternalLink>.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl font-bold text-card-foreground">Open-source software</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              <ul className="space-y-1.5">
                {LIBRARIES.map((lib) => (
                  <li key={lib.name} className="flex justify-between gap-4">
                    <ExternalLink href={lib.href}>{lib.name}</ExternalLink>
                    <span className="text-muted-foreground/70">{lib.license}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 pt-3 border-t border-border">
                VNGeoGuessr itself is open source under the{' '}
                <ExternalLink href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</ExternalLink>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
