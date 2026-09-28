import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
  plugins: [react(), tailwindcss(), spaFallback()],
  server: { port: 5173 },
});
