# CrewCheck TV: LG webOS 2019 candidate

Target: user-confirmed LG SM9000 55-inch NanoCell, webOS 4.5 / Chromium 53 (regional suffix and installed firmware pending device inspection). The LG package imports the existing TV player and canonical core; no roster/parser/APZ/journey rules are copied.

## Build

From repository root:
```
npm ci
npm ci --prefix apps/webos
npm run package --prefix apps/webos
node apps/webos/verify.mjs
npx tsc --noEmit -p tsconfig.tv.json
node scripts/test-android-tv.mjs
```

Output: `dist/webos-package/com.crewcheck.tv_1.0.0_all.ipk`. Local test package, not a signed LG store release. The official LG CLI validates and packages the app. It has a classic-script ES2016-compatible bundle, required runtime polyfills, official webOSTV.js, an isolated Flexbox layout without CSS Grid/flex gap/clamp dependencies, 80/130-pixel launcher icons, 1920x1080 rendering and Back key 461 handling via the shared player. Full HD app rendering is intentional on the 4K panel.

## Install on the TV

1. Confirm the full model and webOS version under TV information.
2. Connect TV and computer to the same local network.
3. Install the official **Developer Mode** app from LG Apps on the TV and sign in with an LG Developer account yourself.
4. Enable Developer Mode, complete the TV restart, then enable Key Server. Record the local TV IP. Enter the displayed passphrase locally when the LG CLI requests it; do not commit it.
5. Configure a device using `ares-setup-device`, then obtain its key with `ares-novacom --device <name> --getkey`.
6. Install using `ares-install --device <name> dist/webos-package/com.crewcheck.tv_1.0.0_all.ipk`, then launch with `ares-launch --device <name> com.crewcheck.tv`.

Developer Mode is a temporary testing facility; renew its session before expiry. This package is not installed by simply putting it on a USB drive. Public distribution uses LG Seller Lounge, separate from Google Play.

## Validation and remaining gates

Package creation, TypeScript, TV Core behavior checks, ES2016 syntax and legacy request timeout checks pass. Modern-browser smoke: D-pad/Enter opens month and day, Back returns to month, the September calendar has five rows and ends before its explanatory note, footer remains inside 1080 pixels. This does not certify the Chromium 53 device runtime.

Physical TV testing remains required: Magic Remote pointer, key 461 and Home exit, suspend/resume, TLS/API reachability, frame rate and six-row months. Production TV backend is still unavailable; live pairing/news cannot be certified. Packaged file-origin API CORS and token flow need end-to-end verification on-device before a real roster pilot. Demo is explicit, optional and synthetic. No LG store submission or production publication has occurred.

References:
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- https://webostv.developer.lge.com/develop/references/appinfo-json
- https://webostv.developer.lge.com/develop/guides/back-button
- https://webostv.developer.lge.com/develop/getting-started/developer-mode-app

