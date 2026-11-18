import type { Metadata, Viewport } from "next";
// Fonts are bundled from npm (Fontsource) so builds never depend on an external font CDN.
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import { DEFAULT_LOCALE, dirFor } from "@/lib/i18n/config";
import { ServiceWorkerRegistrar } from "@/components/pwa/sw-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SaveTheSoul — Your AI companion for mental wellbeing",
    template: "%s · SaveTheSoul",
  },
  description:
    "Your AI Companion. Your Mental Wellbeing. Your Connection to Real Care. A wellbeing companion for Abu Dhabi that connects supportive conversation with real professional care.",
  applicationName: "SaveTheSoul",
  appleWebApp: { capable: true, title: "SaveTheSoul", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f5f0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = DEFAULT_LOCALE;
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift">
          Skip to content
        </a>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
