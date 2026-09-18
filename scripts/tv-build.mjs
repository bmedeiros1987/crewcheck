import { build } from "vite";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
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
if (platform === "android-tv") {
  const html = await readFile(`${target}/index.html`, "utf8");
  const viewport = 'content="width=device-width,initial-scale=1"';
  if (!html.includes(viewport)) throw new Error("Android TV viewport template changed");
  await writeFile(`${target}/index.html`, html.replace(viewport, 'content="width=1280"'));
}
if (platform === "samsung-tizen")
  await cp("apps/samsung-tizen/config.xml", `${target}/config.xml`);
if (platform === "lg-webos") {
  await cp("apps/lg-webos/appinfo.json", `${target}/appinfo.json`);
  const cssFile = (await import("node:fs/promises")).readdir(target).then((files) => files.find((file) => file.endsWith(".css")));
  const cssName = await cssFile;
  if (!cssName) throw new Error("LG webOS legacy CSS bundle missing");
  await writeFile(
    `${target}/index.html`,
    `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920"><title>CrewCheck TV</title><link rel="stylesheet" href="./${cssName}"></head><body><div id="root"></div><script src="./crewcheck-tv.js"></script></body></html>`,
  );
}
if (platform === "samsung-tizen")
  await cp("apps/tv-assets/icon-512.png", `${target}/icon.png`);
if (platform === "lg-webos") {
  await cp("apps/tv-assets/icon-80.png", `${target}/icon.png`);
  await cp("apps/tv-assets/icon-130.png", `${target}/large-icon.png`);
}
// Demo identities cannot replace a production installation.
const demo = process.env.VITE_TV_DEMO === "true";
if (demo && platform === "lg-webos") {
  const manifest = JSON.parse(await readFile(`${target}/appinfo.json`, "utf8"));
  manifest.id += ".demo";
  manifest.title += " Demo";
  await writeFile(`${target}/appinfo.json`, JSON.stringify(manifest, null, 2));
}
if (demo && platform === "samsung-tizen") {
  const manifest = await readFile(`${target}/config.xml`, "utf8");
  await writeFile(`${target}/config.xml`, manifest.replaceAll("CrewChkTV1", "CrewChkDm1").replace("<name>CrewCheck TV</name>", "<name>CrewCheck TV Demo</name>"));
}
await writeFile(`${target}/tv-build.json`, JSON.stringify({
  platform, demo, operational: false,
  commit: process.env.GITHUB_SHA || null,
  note: "Experimental build; not store approved. Runtime feature gates still apply.",
}, null, 2));
console.log(
  `Staged ${platform}: ${target}. Native packaging/signing NOT performed.`,
);
