import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function githubPagesSpaFallback(): Plugin {
  return {
    name: "github-pages-spa-fallback",
    closeBundle() {
      const index = resolve("dist/client/index.html");
      if (existsSync(index)) copyFileSync(index, resolve("dist/client/404.html"));
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), githubPagesSpaFallback()],
  base: command === "build" ? "/aero-asset-tycoon/" : "/",
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/v1": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
    },
  },
}));
