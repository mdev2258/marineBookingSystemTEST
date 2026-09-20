import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// globals.css declares --font-sans: var(--font-inter). The variable name has to
// match or every surface silently falls back to ui-sans-serif.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// The demo operator is the default because most routes are theirs. The
// marketing page at / is the freelancer's own business and overrides this.
export const metadata: Metadata = {
  title: "Harbourside Sailing",
  description: "Sailing lessons, keelboat tasters and RIB trips from Lymington.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
