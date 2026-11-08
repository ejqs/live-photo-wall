import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Wall", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#000000" };

export default function WallLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark bg-black text-white">{children}</div>;
}
