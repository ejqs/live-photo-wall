import type { Metadata, Viewport } from "next";
import { Anton, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Live Photo Wall", template: "%s · Live Photo Wall" },
  description: "Guests share photos; approved photos glide onto a live photo wall.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#09090b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
