import { DEFAULT_SLIDERS, type MotionSliders } from "@/wallmotion/types";

/** Built-in fonts. Uploaded fonts are referenced by asset id. */
export const SYSTEM_FONTS = {
  display: { label: "Anton (built-in display)", css: "var(--font-display), Impact, sans-serif" },
  sans: { label: "Inter (built-in)", css: "var(--font-inter), system-ui, sans-serif" },
  serif: { label: "Serif (system)", css: "Georgia, 'Times New Roman', serif" },
} as const;
export type SystemFont = keyof typeof SYSTEM_FONTS;

export type EventSettings = {
  name: string;
  /** ISO time the event ends: the landing page switches to "after" mode, retention counts from here */
  endsAt: string | null;
  retentionDays: number;
  /** Public base URL used for the QR and links, if different from the app URL (custom domain). */
  publicUrl: string | null;
};

export type LogoPosition = "bottom" | "top";

export type GuestPageSettings = {
  open: boolean;
  library: boolean;
  camera: boolean;
  captionRequired: boolean;
  gallery: boolean;
  countdown: boolean;
  autoApprove: boolean;
  perGuest: number;
  headline: string;
  intro: string;
  buttonColor: string;
  showLogos: boolean;
  logoPosition: LogoPosition;
  logoAssetIds: string[];
  header: "strip" | "image";
  headerAssetId: string | null;
};

type LayerBase = { id: string; name: string; hidden?: boolean };
export type TextLayer = LayerBase & {
  type: "text";
  text: string;
  font: string; // SystemFont key or asset id
  size: number; // % of canvas height
  letterSpacing: number; // em
  weight: number;
  color: string;
  shadow: boolean;
  uppercase: boolean;
  align: "left" | "center" | "right";
  x: number; // % of width (anchor depends on align)
  y: number; // % of height (center)
};
export type ImageLayer = LayerBase & { type: "image"; assetId: string | null; x: number; y: number; w: number; opacity: number };
export type QrLayer = LayerBase & {
  type: "qr";
  x: number;
  y: number;
  size: number; // % of height
  style: "classic" | "dots" | "rounded";
  logoAssetId: string | null;
  inverse: boolean;
  label: string;
  cardColor: string;
  textColor: string;
};
export type DimLayer = LayerBase & { type: "dim"; amount: number; mode: "even" | "bottom" | "top" | "center" };
export type DesignLayer = TextLayer | ImageLayer | QrLayer | DimLayer;

export type Design = {
  background: string;
  /** gap between cells in % of canvas height */
  gap: number;
  /** corner radius of cells in % of cell height */
  radius: number;
  layers: DesignLayer[];
};

export type DesignSettings = { draft: Design; published: Design; publishedVersion: number; publishedAt: string | null };

export type CustomEffect = { id: string; name: string; code: string };

export type MotionSettings = {
  preset: string;
  sliders: MotionSliders;
  effectId: string; // "builtin" or a custom effect id
  custom: CustomEffect[];
  /** slider values for custom effect params, by effect id */
  params: Record<string, Record<string, number>>;
  version: number;
};

export type PlaylistSettings = {
  order: "filename" | "random" | "guests-first";
  /** how long a fast-lane photo stays before it can be swapped out */
  fastLaneHold: number;
  /** seconds of notice the guest gets before their photo lands */
  fastLaneLead: number;
};

export type LandingSettings = {
  published: boolean;
  introDuring: string;
  introAfter: string;
  liveStrip: boolean;
  galleryLink: boolean;
  showVideo: boolean;
};

export type SettingsMap = {
  event: EventSettings;
  guest: GuestPageSettings;
  design: DesignSettings;
  motion: MotionSettings;
  playlist: PlaylistSettings;
  landing: LandingSettings;
  manifest: { version: number };
};
export type SettingsKey = keyof SettingsMap;

export const DEFAULT_DESIGN: Design = {
  background: "#000000",
  gap: 0,
  radius: 0,
  layers: [
    { id: "dim", type: "dim", name: "Dim", amount: 0.4, mode: "even" },
    {
      id: "title",
      type: "text",
      name: "Title",
      text: "YOUR EVENT",
      font: "display",
      size: 16,
      letterSpacing: 0.03,
      weight: 400,
      color: "#ffffff",
      shadow: true,
      uppercase: true,
      align: "center",
      x: 50,
      y: 44,
    },
    {
      id: "subtitle",
      type: "text",
      name: "Subtitle",
      text: "your tagline goes here",
      font: "sans",
      size: 3.6,
      letterSpacing: 0.02,
      weight: 500,
      color: "#ffffff",
      shadow: true,
      uppercase: false,
      align: "center",
      x: 50,
      y: 57,
    },
    {
      id: "qr",
      type: "qr",
      name: "Guest QR",
      x: 91,
      y: 82,
      size: 22,
      style: "rounded",
      logoAssetId: null,
      inverse: false,
      label: "Add your photo",
      cardColor: "#ffffff",
      textColor: "#09090b",
    },
  ],
};

export const DEFAULTS: SettingsMap = {
  event: { name: "Your Event", endsAt: null, retentionDays: 30, publicUrl: null },
  guest: {
    open: true,
    library: true,
    camera: true,
    captionRequired: false,
    gallery: true,
    countdown: true,
    autoApprove: false,
    perGuest: 10,
    headline: "Add your photo to the wall",
    intro: "Share a favorite memory. It shows up on the big screen after a quick review by the hosts.",
    buttonColor: "#18181b",
    showLogos: true,
    logoPosition: "bottom",
    logoAssetIds: [],
    header: "strip",
    headerAssetId: null,
  },
  design: { draft: DEFAULT_DESIGN, published: DEFAULT_DESIGN, publishedVersion: 1, publishedAt: null },
  motion: { preset: "Default", sliders: DEFAULT_SLIDERS, effectId: "builtin", custom: [], params: {}, version: 1 },
  playlist: { order: "filename", fastLaneHold: 10, fastLaneLead: 3 },
  landing: {
    published: false,
    introDuring: "Share a favorite memory and watch it appear on the big screen tonight.",
    introAfter: "Thank you for every photo you shared. Here is the wall, all in one place.",
    liveStrip: true,
    galleryLink: true,
    showVideo: false,
  },
  manifest: { version: 1 },
};
