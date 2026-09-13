import type { Metadata } from "next";
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

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "CallCatch — Every missed call texts back in 10 seconds",
    template: "%s · CallCatch",
  },
  description:
    "CallCatch is the AI text-back front desk for HVAC, plumbing and electrical contractors. When you can't pick up, the caller gets a text in seconds, gets qualified, and lands as a booking-ready lead on your phone.",
  openGraph: {
    title: "CallCatch — Every missed call texts back in 10 seconds",
    description:
      "AI text-back front desk for home-service contractors. No number change. 10-minute setup.",
    url: appUrl,
    siteName: "CallCatch",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
