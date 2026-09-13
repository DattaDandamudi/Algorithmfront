import type { ReactNode } from "react";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { MetaPixel } from "@/components/marketing/MetaPixel";
import { AttributionCapture } from "@/components/marketing/AttributionCapture";
import { MarketingStyles } from "@/components/marketing/MarketingStyles";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingStyles />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-brand-900 focus:shadow"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <MetaPixel />
      <AttributionCapture />
    </>
  );
}
