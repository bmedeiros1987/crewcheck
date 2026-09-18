# Android TV internal candidate — 2026-09-18

## Package and toolchain
- Application ID: `com.crewcheck.tv`; mobile remains `com.crewcheck.app`.
- Version code 1, version name 1.0.0-internal. Increment before subsequent Play uploads.
- compileSdk/targetSdk 36; minimum API 26; AGP 8.11.1, Gradle 8.13, JDK 17.
- Android TV currently has a Play target minimum of API 34, independently of mobile API 36. This candidate targets 36 and uses AndroidX Back dispatch.
- Leanback-only launcher, touchscreen optional, landscape, banner 320x180 and existing CrewCheck icon.
- The shared player is packaged in the AAB and served locally under `https://crewcheck.online/tv-native/`; API calls use first-party HTTPS. No remote page navigation, file access, native credential bridge, backup or mixed content.

## Build and signing
The branch workflow `.github/workflows/android-tv-internal.yml` performs TV TypeScript checks, behavioral tests, web compilation, Android lint, signed APK/AAB generation and JAR-signature verification. It writes the source SHA and SHA-256 sums alongside the artifacts. No Play publishing action exists in the workflow.

The existing repository upload-key secrets are consumed exclusively on the ephemeral GitHub runner, and the temporary keystore is deleted. Reusing an upload certificate does not collide with the mobile package. Play App Signing enrollment and the distribution-signing key must still be confirmed in the TV app's Console; neither enrollment nor key selection has been performed here.

Local prerequisites: Node 22+, JDK 17, Gradle 8.13 and SDK 36. Build the player with `VITE_CREWCHECK_TV_ENABLED=true npx vite build --config apps/tv-player/vite.config.mjs`, then run `gradle -p apps/android-tv :app:lintRelease :app:bundleRelease`. Release builds fail if any CREWCHECK_STORE_FILE/STORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD value is missing. Do not commit keys or passwords.

## Functional scope
Live, Briefing and Ambient selection, two-minute inactivity transition, monthly/weekly/daily views, D-pad focus, OK and Back, family/private snapshot isolation, stale-data markers, bounded offline memory and editorial-only news fallback. TV Core imports the existing canonical roster engine. Published APZ is required; departure is never substituted. Family projections also redact identifiers containing route/flight details.

The explicit “Explorar demonstração” button displays synthetic data with a permanent demonstration label. API failure never silently substitutes demo data. The build has no entitlement/billing implementation and must not be advertised as a paid Premium release.

## Remaining operational dependencies
The parallel TV-family implementation owns the `/api/tv/*` service, transactional pairing store, approval UI and backend deployment. These are not deployed by this Android packaging PR. Real-account pairing, live roster sync, remote revoke and a production editorial provider require that service to be reviewed, enabled and tested end to end. The player displays missing operational facts instead of inventing weather, gate or departure advice.

#530 remains OPEN. #607 prohibits broad external launch before canonical and release gates. This artifact is an internal candidate only; no production release is authorized or performed.

## Validation evidence
- TV TypeScript and behavioral tests: pass (calendar, remote keys, fresh/stale data, 15-minute lease, 401 clearing, device mismatch, no private persistence, family redaction and published APZ guard).
- Root `tsc --noEmit`: pass.
- Root `npm run check`: blocked by pre-existing `scripts/v139/apply-core.mjs` “anchor not found in canonical range”; its generated Home change was discarded. TV build does not invoke that preparer.
- Browser smoke: D-pad/OK, calendar, detail and Back checked; 720p and 1080p layout checked. Browser screenshots are QA evidence, not native-TV store screenshots.
- Native Android lint/build/signature: see exact workflow linked in PR.
- Physical Google TV/Android TV and native emulator runtime: NOT tested. Do not claim device certification.

## Play Console observed state
Authenticated developer account BrunoMedeiros, developer ID 6845018933737586202. Only mobile `com.crewcheck.app` was listed. “CrewCheck TV”, pt-BR, app, free download, `com.crewcheck.tv` were entered in the new-app form; Console explicitly confirmed package availability.

Creation is NOT submitted. The unchecked declarations require confirmation that the app complies with Developer Program Policies and certification of compliance with US export laws, including cryptography. No declarations were accepted. Consequently no TV app, internal track, tester list, App Signing enrollment or AAB upload exists yet. Preserve this distinction from successful build.

Account also displays Android developer verification due 2026-09-30 and an existing mobile update rejection. They were observed only; this PR does not resolve or modify the mobile release.

## Minimal internal-test metadata prepared
- Name: CrewCheck TV
- Default language: Portuguese (Brazil)
- Type: App; free download
- Package: com.crewcheck.tv
- Release name: 1.0.0-internal (1)
- Release notes: Primeiro candidato de teste para Android TV: navegação por controle, modos Live/Briefing/Ambient e consulta da escala. Demonstração opcional com dados fictícios. Pareamento real depende da ativação do serviço TV.
- Short description draft: Sua escala e próxima jornada em uma experiência dedicada à TV.
- Tester list: not created; tester addresses/groups require user selection.
- Privacy policy URL, Data Safety, content rating, target audience and app access: do not infer or certify from the mobile app. Complete against actual TV behavior if required by the chosen track.

## Official references reviewed
- https://developer.android.com/google/play/requirements/target-sdk
- https://developer.android.com/training/tv/get-started/create
- https://developer.android.com/build/releases/agp-8-11-0-release-notes
- https://developer.android.com/studio/publish/app-signing
