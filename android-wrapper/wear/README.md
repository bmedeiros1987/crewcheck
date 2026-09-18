# CrewCheck Watch for Wear OS

Native Wear OS companion for the CrewCheck canonical roster. The target device for this slice is the Samsung Galaxy Watch 4 and later.

## Implemented

- contextual home screen that emphasizes only the next relevant action;
- explicit APZ/presentation, flight, route, ETA, gate and remote-stand states;
- connection, overnight and pickup cards;
- versioned `WatchContextSnapshot` contract (`schemaVersion: 1`);
- last-known-good local cache with stale-data warning;
- HTTPS refresh with a short-lived build-time test token;
- phone-to-watch Data Layer receiver at `/crewcheck/watch-context/v1`;
- Wear OS Tile: **Próximo passo CrewCheck**;
- three complication data sources: next step, flight and gate;
- operational alert notification when the canonical snapshot carries a new `alertId`;
- no AIMS/PDF parser and no duty-rule reconstruction on the watch.

## Architecture

The watch is a rendering client. The phone/backend remains responsible for:

- journey segmentation;
- APZ/presentation calculation;
- ground time versus overnight;
- current leg and gate normalization;
- intelligent leave time;
- RBAC/ACT rules.

The watch accepts one compact JSON projection and stores the last valid snapshot.

## Build

From `android-wrapper/`:

```bash
gradle :wear:assembleDebug
gradle :wear:bundleRelease
```

## Live-data configuration

For standalone HTTPS testing:

```bash
gradle :wear:assembleDebug \
  -PCREWCHECK_WATCH_ENDPOINT=https://example.com/api/watch/context \
  -PCREWCHECK_WATCH_TOKEN=SHORT_LIVED_TEST_TOKEN
```

Do not ship a permanent token inside the APK. Production should use the paired phone's authenticated Data Layer sync or a revocable, short-lived watch session.

## Data Layer contract

Path:

```text
/crewcheck/watch-context/v1
```

Preferred `DataMap` key:

```text
snapshotJson
```

The value is the complete JSON document below. A raw UTF-8 message on the same path is also accepted.

## Snapshot v1 example

```json
{
  "schemaVersion": 1,
  "snapshotId": "journey-2026-09-18T12:00:00Z-r3",
  "journeyId": "journey-abc",
  "generatedAt": "2026-09-18T12:00:00Z",
  "validUntil": "2026-09-18T18:00:00Z",
  "phase": "LEAVE",
  "nextAction": {
    "label": "SAIR EM",
    "value": "18 MIN",
    "detail": "APZ 13:30 • BSB",
    "at": "2026-09-18T12:18:00Z"
  },
  "presentation": {
    "time": "13:30",
    "place": "BSB • apresentação"
  },
  "leave": {
    "time": "12:42",
    "detail": "Trânsito normal • 28 min"
  },
  "currentLeg": {
    "flight": "LA3721",
    "route": "BSB → GRU",
    "eta": "15:35",
    "gate": "24",
    "gateMode": "JET_BRIDGE"
  },
  "connectionInfo": {
    "duration": "1H20",
    "nextFlight": "LA3102",
    "detail": "Portão 18 • embarque 16:15"
  },
  "overnightInfo": {
    "station": "GYN",
    "detail": "Hotel confirmado • pickup 09:20"
  },
  "alert": {
    "id": "gate-change-LA3721-24",
    "title": "Portão alterado",
    "body": "O voo LA3721 agora embarca no portão 24."
  }
}
```

For a remote stand, the canonical producer should send:

```json
{
  "currentLeg": {
    "gate": "",
    "gateMode": "REMOTE"
  }
}
```

The UI then renders `REMOTA` explicitly.

## Current integration boundary

The watch-side transport is complete. The phone wrapper still needs to publish the authenticated canonical snapshot to the Data Layer after login, roster refresh and material changes. Until that producer is connected, the app uses its local last-known-good state or the clearly labeled demo state.
