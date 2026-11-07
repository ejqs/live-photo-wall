import type { Metadata } from "next";
import { WallApp } from "./wall-app";

export const metadata: Metadata = { title: "Photo wall" };

export default function WallPlayPage() {
  return <WallApp />;
}
