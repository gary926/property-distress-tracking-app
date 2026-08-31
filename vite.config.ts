import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: false, // scripts/build.mjs writes _worker.js into dist too
  },
  server: {
    proxy: {
      // `npm run dev` runs Vite against a local wrangler pages dev on 8788.
      "/api": "http://127.0.0.1:8788",
    },
  },
});
