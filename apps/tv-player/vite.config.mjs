import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/tv-player",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/tv-player",
    emptyOutDir: true,
    target: "chrome87",
  },
});

