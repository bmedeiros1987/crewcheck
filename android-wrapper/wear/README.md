# CrewCheck Watch v1

Wear OS consumer for Galaxy Watch 4 and newer. The watch does **not** parse AIMS/PDF files,
reconstruct journeys, calculate APZ or make regulatory decisions. It renders a compact,
versioned projection produced by the canonical CrewCheck roster.

## Delivered in this slice

- glance-first app with a single next-step hero;
- explicit `REMOTA` gate state;
- encrypted app-private cache using AES-GCM + Android Keystore;
- Data Layer background receiver and manual resync request;
- fail-closed schema/size/PII validation;
- stale/no-data state instead of silently presenting demo data;
- SHORT_TEXT and LONG_TEXT complication source;
- debug-only demonstration button;
- unit tests for the projection contract.

## Data Layer contract

- DataItem/message path: `/crewcheck/watch/context/v1`
- resync request path: `/crewcheck/watch/request-sync/v1`
- DataMap key: `snapshotJson`
- maximum payload: 16 KiB
- schema: `docs/crewcheck-watch-context-v1.md`

The phone and Wear modules intentionally share the application id `com.crewcheck.app`. Production
releases must also use the same signing identity for Data Layer communication.

## Build

```bash
cd android-wrapper
gradle :wear:testDebugUnitTest :wear:assembleDebug :wear:bundleRelease
```

The release signing environment variables are the same as the phone app:

- `CREWCHECK_STORE_FILE`
- `CREWCHECK_STORE_PASSWORD`
- `CREWCHECK_KEY_ALIAS`
- `CREWCHECK_KEY_PASSWORD`

An unsigned release bundle is still produced when those values are absent, for CI validation only.
