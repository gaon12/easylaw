import type { MetadataRoute } from "next";
import { site } from "@/lib/strings";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: site.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#f5f8fc",
    theme_color: "#173f75",
    icons: [
      { src: "/brand/easylaw-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/easylaw-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
