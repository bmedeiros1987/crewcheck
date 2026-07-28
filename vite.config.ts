import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const runtimeEnv = loadEnv(mode, process.cwd(), "");
  const googleClientId = String(
    runtimeEnv.VITE_GOOGLE_CLIENT_ID
    || runtimeEnv.GOOGLE_CLIENT_ID
    || process.env.VITE_GOOGLE_CLIENT_ID
    || process.env.GOOGLE_CLIENT_ID
    || "",
  ).trim();

  return {
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(googleClientId),
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: 3000,
      allowedHosts: "all",
    },
    preview: {
      host: true,
      port: Number(process.env.PORT) || 4173,
      allowedHosts: ["crewcheck.onrender.com", ".onrender.com"],
    },
  };
});
