# CrewCheck Watch Context v1

## Boundary

`WatchContextSnapshot` is a presentation projection of the **canonical CrewCheck roster**. The
producer decides the next relevant action. Consumers such as Wear OS, future Garmin/Apple clients,
Tiles and complications must not:

- parse roster PDFs;
- infer a `journeyId`;
- calculate APZ/presentation;
- decide whether ground time is a connection or overnight;
- calculate regulatory limits;
- turn missing information into an operational assumption.

Unknown or stale data must remain explicit.

## Transport

| Item | Value |
| --- | --- |
| Schema | `1` |
| Data Layer path | `/crewcheck/watch/context/v1` |
| DataMap key | `snapshotJson` |
| Resync request | `/crewcheck/watch/request-sync/v1` |
| Maximum UTF-8 payload | 16 KiB |
| Source of truth | canonical CrewCheck roster |

## JSON example

```json
{
  "schemaVersion": 1,
  "contextId": "journey-2026-09-18-bsb-01",
  "generatedAtEpochMs": 1789730400000,
  "validUntilEpochMs": 1789737600000,
  "state": "LEAVE_SOON",
  "headline": "SAIR EM 18 MIN",
  "primaryTime": "12:42",
  "detail": "APZ 13:30 • BSB",
  "presentationTime": "13:30",
  "presentationPlace": "BSB",
  "leaveTime": "12:42",
  "trafficDetail": "38 min • trânsito normal",
  "currentFlight": "LA3721",
  "currentRoute": "BSB → GRU",
  "gate": "24",
  "remoteStand": false,
  "boardingTime": "13:45",
  "eta": "15:10",
  "connection": "",
  "nextFlight": "",
  "nextDetail": "",
  "overnight": "",
  "hotelPickup": "",
  "changed": false,
  "source": "canonical-roster"
}
```

`state` accepts `OFF_DUTY`, `LEAVE_SOON`, `REPORTING`, `BOARDING`, `IN_FLIGHT`, `CONNECTION`,
`OVERNIGHT`, `CHANGED` or `UNKNOWN`.

## Privacy and failure behavior

Do not send CPF, e-mail, phone, crew member name or hotel room number. The Wear client rejects
known personal fields, validates the schema, caps field sizes, encrypts the last valid snapshot
with a non-exportable Android Keystore key and disables Android backup. A malformed update never
replaces the last valid cache.

`validUntilEpochMs` is mandatory in production projections. After expiry, the watch keeps context
visible only as stale and asks the user to open CrewCheck on the phone.
