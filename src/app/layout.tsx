import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// The Industry system pairs Barlow for body with Barlow Condensed for every
// heading, kicker, reference and numeral. Loaded through next/font rather than
// the stylesheet's @import so there is no extra blocking request.
const barlow = Barlow({
  variable: "--font-barlow",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["400", "600"],
  subsets: ["latin"],
});

// The demo operator is the default because most routes are theirs. The
// marketing page at / is the freelancer's own business and overrides this.
export const metadata: Metadata = {
  title: "Harbourside Marine",
  description: "Boatyard and marine services in Lymington: liftouts, surveys, rigging and repair.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
