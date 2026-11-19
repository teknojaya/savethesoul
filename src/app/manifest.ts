import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SaveTheSoul — AI wellbeing companion",
    short_name: "SaveTheSoul",
    description: "Your AI Companion. Your Mental Wellbeing. Your Connection to Real Care.",
    start_url: "/patient",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f8ff",
    theme_color: "#1868db",
    lang: "en",
    dir: "ltr",
    categories: ["health", "medical", "lifestyle"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Get help now", url: "/help", description: "Emergency and crisis support numbers" },
      { name: "Talk to the companion", url: "/patient/companion" },
    ],
  };
}
