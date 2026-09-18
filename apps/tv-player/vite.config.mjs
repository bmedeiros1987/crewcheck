import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const platform = process.env.VITE_TV_PLATFORM || "android-tv";
const legacyLg = platform === "lg-webos";
const entry = fileURLToPath(new URL("./src/main.tsx", import.meta.url));

export default defineConfig({
  root: "apps/tv-player",
  base: "./",
  plugins: [react()],
  build: legacyLg
    ? {
        outDir: "../../dist/tv-player",
        emptyOutDir: true,
        target: "chrome53",
        cssTarget: "chrome53",
        cssCodeSplit: false,
        lib: {
          entry,
          name: "CrewCheckTV",
          formats: ["iife"],
          fileName: () => "crewcheck-tv.js",
          cssFileName: "crewcheck-tv",
        },
        rollupOptions: {
          output: { inlineDynamicImports: true },
        },
      }
    : {
        outDir: "../../dist/tv-player",
        emptyOutDir: true,
        target: "chrome87",
      },
});
