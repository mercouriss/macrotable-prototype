import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * GitHub Pages serves the site from /<repo>/, so the deploy workflow sets
 * VITE_BASE=/macrotable-prototype/. Locally (and on Vercel/Netlify) it is "/".
 */
const base = process.env.VITE_BASE ?? "/";

/** Static hosts without rewrites (GitHub Pages) serve 404.html for deep links → hand them the SPA. */
function spaFallback(): Plugin {
  return {
    name: "spa-404-fallback",
    apply: "build",
    closeBundle() {
      const dist = resolve(__dirname, "dist");
      copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    spaFallback(),
    // Installable + resilient after first load. Not a promise of production-grade offline.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // registered from main.tsx, production only
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "MacroTable — research prototype",
        short_name: "MacroTable",
        description: "Nutrition-aware restaurant ordering. University research prototype; all restaurant data simulated.",
        theme_color: "#F6F5F1",
        background_color: "#F6F5F1",
        display: "standalone",
        orientation: "portrait",
        start_url: `${base}macrotable`,
        scope: base,
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        // SPA: serve the app shell for any in-scope navigation (fixes GitHub Pages 404 deep links after first visit).
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173 },
});
