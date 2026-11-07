import type { Design, PlaylistSettings } from "@/lib/settings-types";
import type { MotionSliders } from "@/wallmotion/types";

export type WallPhoto = {
  id: string;
  hash: string;
  source: "guest" | "roster";
  name: string | null;
  caption: string | null;
  w: number;
  h: number;
  /** ms epoch when approved (newer guest photos jump the queue once) */
  at: number;
};

export type WallFont = { id: string; family: string; url: string };

export type WallManifest = {
  version: number;
  wall: { id: string; name: string; cols: number; rows: number; showQr: boolean; primary: boolean };
  eventName: string;
  design: Design;
  designVersion: number;
  motion: {
    version: number;
    sliders: MotionSliders;
    /** effect file as JSON text (validated on the server, re-validated on the wall) */
    effect: string;
    effectName: string;
    params: Record<string, number>;
  };
  playlist: PlaylistSettings;
  qrUrl: string;
  fonts: WallFont[];
  assets: Record<string, string>;
  photos: WallPhoto[];
  resyncAt: number | null;
};

export const imgUrl = (kind: "view" | "thumb" | "orig", hash: string) =>
  `/img/${kind}/${hash}.${kind === "orig" ? "jpg" : "webp"}`;
