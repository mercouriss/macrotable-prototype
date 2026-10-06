import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
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

/** Commit baked into the build (for the experiment freeze record). */
const commit = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
})();

/**
 * Static hosts without rewrites (GitHub Pages):
 *  - 404.html = the SPA, so any deep link still renders (with HTTP 404 on first load);
 *  - real <route>/index.html copies for the top-level entry points people open directly
 *    (participant links, /demo, /research…) so those return HTTP 200. Pages redirects
 *    /experiment → /experiment/ (query kept); the app strips the trailing slash.
 */
const ENTRY_ROUTES = ["macrotable", "baseline", "research", "experiment", "demo", "privacy", "welcome", "r/fitkitchen"]; // r/fitkitchen: the Demo Day presentation QR

function spaFallback(): Plugin {
  return {
    name: "spa-static-fallbacks",
    apply: "build",
    closeBundle() {
      const dist = resolve(import.meta.dirname, "dist");
      const index = resolve(dist, "index.html");
      copyFileSync(index, resolve(dist, "404.html"));
      for (const r of ENTRY_ROUTES) {
        mkdirSync(resolve(dist, r), { recursive: true });
        copyFileSync(index, resolve(dist, r, "index.html"));
      }
    },
  };
}

export default defineConfig({
  base,
  define: { __APP_COMMIT__: JSON.stringify(commit) },
  plugins: [
    react(),
    tailwindcss(),
    spaFallback(),
    // Installable + resilient after first load. Not a promise of production-grade offline.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // registered from main.tsx, production only
      includeAssets: ["icons/*.png", "brand/macrotable-wordmark.png"],
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
          { src: "icons/macrotable-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/macrotable-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/macrotable-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // webp: the local real-restaurant logos (public/logos/real), so they stay available offline.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,webmanifest}"],
        // SPA: serve the app shell for any in-scope navigation (fixes GitHub Pages 404 deep links after first visit).
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        // Activate a new deploy immediately and take over open pages; the registration's
        // "activated (isUpdate)" handler then reloads onto the new build. Without these the
        // new worker waits forever while any tab/installed app is open and returning visitors
        // keep seeing the previous build across reloads (found in the V3.1 verification).
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  server: { port: 5173 },
});
