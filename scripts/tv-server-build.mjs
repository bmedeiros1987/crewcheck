import { build } from "esbuild";
await build({
  entryPoints: ["packages/tv-core/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/tv-server/core.mjs",
});
