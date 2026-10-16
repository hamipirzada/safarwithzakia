import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Safar With Zakia — Custom Kashmir trips planned by locals",
    template: "%s · Safar With Zakia",
  },
  description:
    "Plan a custom Kashmir trip with a local team: Srinagar and Dal Lake, Gulmarg, Pahalgam and Sonmarg. Build your route, see published rates and request a quote.",
  applicationName: "Safar With Zakia",
  openGraph: {
    type: "website",
    siteName: "Safar With Zakia",
    locale: "en_IN",
    images: [{ url: "/images/kashmir/dal-lake-dusk.jpg", width: 2000, height: 1333, alt: "A shikara on Dal Lake at dusk" }],
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#16212c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${fraunces.variable} ${instrumentSans.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
