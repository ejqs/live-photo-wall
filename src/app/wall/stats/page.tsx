import type { Metadata } from "next";
import { StatsApp } from "./stats-app";

export const metadata: Metadata = { title: "Wall stats" };

export default function StatsPage() {
  return <StatsApp />;
}
