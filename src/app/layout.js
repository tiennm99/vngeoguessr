import { THEME_STORAGE_KEY } from '../lib/theme';
import DebugFooter from './components/DebugFooter';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "VNGeoGuessr",
  description: "GeoGuessr for VietNam",
};

// light dark lets the OS preference drive native controls, scrollbars and form
// widgets, matching the token palette in globals.css.
export const viewport = {
  colorScheme: "light dark",
  // The game screen is a fixed, non-scrolling surface, so the layout must own
  // the whole display and pad itself against the notch and home indicator.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

// Runs before the first paint, so a dark-theme visitor never sees a white
// flash while the bundle loads. Mirrors resolveDark/applyTheme in lib/theme.js.
const themeScript = `(function(){try{
var c=localStorage.getItem('${THEME_STORAGE_KEY}');
if(c!=='light'&&c!=='dark')c='system';
var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
var r=document.documentElement;
r.classList.toggle('dark',d);
r.style.colorScheme=d?'dark':'light';
}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Sticky-footer column: pages fill the viewport via flex-1 and the
            footer keeps its own strip below them, so it can never overlap the
            game's panorama, map, or action bar — and nothing covers it. The
            column is a wrapper rather than <body> itself because Radix portals
            append to <body>; as flex items they would each become a row under
            the footer the moment one rendered anything in flow. */}
        <div className="flex min-h-dvh flex-col">
          {children}
          <DebugFooter />
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
