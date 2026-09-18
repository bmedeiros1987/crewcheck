import { build } from "vite";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
const platform = process.argv[2] || "web";
if (!["web", "android-tv", "samsung-tizen", "lg-webos"].includes(platform))
  throw new Error("Unsupported platform");
process.env.VITE_TV_PLATFORM = platform === "web" ? "android-tv" : platform;
await build({ configFile: "apps/tv-player/vite.config.mjs" });
if (platform === "web") process.exit(0);
const target =
  platform === "android-tv"
    ? "apps/android-tv/app/src/main/assets/tv"
    : `dist/${platform}`;
const resolvedTarget = path.resolve(target);
if (
  !resolvedTarget.startsWith(path.resolve("dist") + path.sep) &&
  resolvedTarget !== path.resolve("apps/android-tv/app/src/main/assets/tv")
)
  throw new Error("Unsafe staging path");
await rm(resolvedTarget, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp("dist/tv-player", target, { recursive: true });
if (platform === "samsung-tizen")
  await cp("apps/samsung-tizen/config.xml", `${target}/config.xml`);
if (platform === "lg-webos")
  await cp("apps/lg-webos/appinfo.json", `${target}/appinfo.json`);
if (platform === "samsung-tizen")
  await cp("apps/tv-assets/icon-512.png", `${target}/icon.png`);
if (platform === "lg-webos") {
  await cp("apps/tv-assets/icon-80.png", `${target}/icon.png`);
  await cp("apps/tv-assets/icon-130.png", `${target}/large-icon.png`);
}
console.log(
  `Staged ${platform}: ${target}. Native packaging/signing NOT performed.`,
);
