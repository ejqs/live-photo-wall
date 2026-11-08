import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Live Photo Wall",
    short_name: "Photo Wall",
    description: "Full-screen photo wall that keeps playing offline.",
    start_url: "/wall",
    scope: "/",
    display: "fullscreen",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
