import type { Metadata } from "next";
import { RenderApp } from "./render-app";

export const metadata: Metadata = { title: "Render" };

export default function RenderPage() {
  return <RenderApp />;
}
