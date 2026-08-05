import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GlobalProvider } from "@/context/GlobalContext";
import { AppShell } from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE = "https://stockanalytix.vercel.app";
const AUTHOR = "Vansh Kashyap";
const AUTHOR_URL = "https://vanshkashyap.lzworth.in";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "StockAnalytix — AI Stock Research by Vansh Kashyap",
    template: "%s · StockAnalytix by Vansh Kashyap",
  },
  description:
    "StockAnalytix — an AI-powered stock research terminal with live charts, technicals, momentum, screeners, combination scanners and multi-AI analysis. Built by Vansh Kashyap.",
  applicationName: "StockAnalytix",
  authors: [{ name: AUTHOR, url: AUTHOR_URL }],
  creator: AUTHOR,
  publisher: AUTHOR,
  keywords: [
    "Vansh Kashyap", "Vansh Kashyap portfolio", "Vansh Kashyap projects", "Vansh Kashyap developer",
    "StockAnalytix", "AI stock research", "stock screener", "technical analysis", "stock market AI",
    "portfolio tracker", "combination screener", "trading journal",
  ],
  alternates: { canonical: SITE },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "StockAnalytix",
    title: "StockAnalytix — AI Stock Research by Vansh Kashyap",
    description: "AI-powered stock research terminal built by Vansh Kashyap. Live charts, technicals, screeners and multi-AI analysis.",
  },
  twitter: {
    card: "summary_large_image",
    title: "StockAnalytix — AI Stock Research by Vansh Kashyap",
    description: "AI-powered stock research terminal built by Vansh Kashyap.",
  },
  robots: { index: true, follow: true },
  appleWebApp: { capable: true, title: "StockAnalytix", statusBarStyle: "default" },
};

// Structured data so search engines link this project to Vansh Kashyap (Person)
// and to the portfolio site.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${SITE}/#vansh`,
      name: AUTHOR,
      url: AUTHOR_URL,
      jobTitle: "Software Developer",
      sameAs: [AUTHOR_URL, "https://github.com/Obitouchiha002"],
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE}/#app`,
      name: "StockAnalytix",
      url: SITE,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: "AI-powered stock research terminal — live charts, technicals, screeners and multi-AI analysis.",
      author: { "@id": `${SITE}/#vansh` },
      creator: { "@id": `${SITE}/#vansh` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

// Mobile: proper scaling + an app-like status bar tint.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <GlobalProvider>
          <AppShell>{children}</AppShell>
        </GlobalProvider>
      </body>
    </html>
  );
}
