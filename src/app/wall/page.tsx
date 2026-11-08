import type { Metadata } from "next";
import { PairWall } from "./pair-wall";

export const metadata: Metadata = { title: "Pair this display" };

export default function WallPairPage() {
  return <PairWall />;
}
