import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { guardStaticHtml } from './server/static-html-guard.mjs';
import { stampServiceWorkerBuild } from './scripts/ci/stamp-service-worker-build.mjs';

export default defineConfig(({ mode }) => {
  const runtimeEnv = loadEnv(mode, process.cwd(), "");
  const googleClientId = String(
    runtimeEnv.VITE_GOOGLE_CLIENT_ID
    || runtimeEnv.GOOGLE_CLIENT_ID
    || process.env.VITE_GOOGLE_CLIENT_ID
    || process.env.GOOGLE_CLIENT_ID
    || "",
  ).trim();

  // Sanitized build identity (no secrets): lets the running frontend prove which
  // commit/version it was actually built from, instead of a display string that a
  // one-off patch can hardcode and never revisit. Mirrors the same env var priority
  // server.mjs already uses for its own /api/health "release" field.
  let buildVersion = "unknown";
  try {
    buildVersion = String(
      JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8")).version || "unknown",
    );
  } catch {}
  const buildCommit = String(
    process.env.RENDER_GIT_COMMIT || process.env.COMMIT_REF || process.env.SOURCE_VERSION || "local",
  );
  const buildTime = new Date().toISOString();

  let thisShellOutput: string | null = null;
  return {
    plugins: [react(), tailwindcss(),{
      name: 'crewcheck-worker-build',
      apply: 'build',
      configResolved(config) {
        // SSR/library/in-memory builds do not produce the browser HTML shell.
        thisShellOutput = !config.build.ssr && !config.build.lib && config.build.write
          ? path.resolve(config.root, config.build.outDir) : null;
      },
      closeBundle() {
        if (!thisShellOutput) return;
        const root = thisShellOutput, worker = path.join(root, 'sw.js');
        const index = path.join(root, 'index.html');
        const html = guardStaticHtml(fs.readFileSync(index, 'utf8'));
        fs.writeFileSync(index, html);
        const assets = fs.readdirSync(path.join(root, 'assets'), { recursive: true })
          .filter(name => fs.statSync(path.join(root, 'assets', String(name))).isFile())
          .map(name => '/assets/' + String(name).replaceAll('\\', '/'));
        const result = stampServiceWorkerBuild(fs.readFileSync(worker, 'utf8'), html, assets);
        fs.writeFileSync(worker, result.source);
      },
    }],
    define: {
      "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(googleClientId),
      "import.meta.env.VITE_CREWCHECK_BUILD_VERSION": JSON.stringify(buildVersion),
      "import.meta.env.VITE_CREWCHECK_BUILD_COMMIT": JSON.stringify(buildCommit),
      "import.meta.env.VITE_CREWCHECK_BUILD_TIME": JSON.stringify(buildTime),
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
