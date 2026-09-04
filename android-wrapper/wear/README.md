# CrewWatch MVP (Samsung / Wear OS)

Standalone Wear OS prototype for Galaxy Watch 4+ using the same CrewCheck package (`com.crewcheck.app`) and a watch-only hardware filter.

## What works in this MVP

- native Wear OS launcher app;
- touchable cards for APZ/presentation, leave time/traffic, current flight, connection/next leg, and overnight/pickup;
- manual refresh;
- offline/demo fallback;
- optional HTTPS JSON endpoint for live CrewCheck data;
- no parser or roster reconstruction on the watch.

## Build

From `android-wrapper/`:

```bash
./gradlew :wear:assembleDebug
./gradlew :wear:bundleRelease
```

The release AAB is generated under `wear/build/outputs/bundle/release/` and can be uploaded to the Wear OS/internal-testing track in Google Play Console.

## Live-data configuration

Set these Gradle properties or environment variables at build time:

- `CREWCHECK_WATCH_ENDPOINT` — HTTPS endpoint returning the compact canonical watch projection.
- `CREWCHECK_WATCH_TOKEN` — optional short-lived bearer token for MVP testing. Do not commit a production token.

Expected JSON shape:

```json
{
  "presentationTime": "12:45",
  "presentationPlace": "CGH • apresentação",
  "leaveTime": "11:30",
  "trafficDetail": "Trânsito normal • 38 min",
  "currentFlight": "LA3149",
  "currentRoute": "POA → CGH",
  "eta": "14:50",
  "connection": "1h20",
  "nextFlight": "LA3102",
  "nextDetail": "Gate 24 • embarque 15:35",
  "overnight": "GYN",
  "hotelPickup": "Hotel confirmado • pickup 09:20"
}
```

Production direction: replace the MVP build-token path with authenticated phone-to-watch/Data Layer or a dedicated short-lived watch session, while keeping the watch as a consumer of the CrewCheck canonical roster contract.
