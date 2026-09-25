# CrewCheck Drive / Android Auto Lab

This module is an isolated Android Auto prototype and is intentionally **not** part of the production CrewCheck package.

## Product boundary

The first car experience is constrained to driving-relevant destination/POI use cases:

- next airport / terminal;
- next hotel or crew destination;
- critical time context that helps decide when to leave;
- handoff to a navigation provider in a later iteration;
- concise weather/context only when relevant to the drive.

It must **not** become a full roster browser, finance screen, compliance dashboard, concierge catalog, or WebView on the car display.

## Why a separate application ID

Google's Android for Cars quality guidance cautions against prototyping Android Auto support in the production APK because car-app review can affect distribution of subsequent updates. The lab therefore uses:

`com.crewcheck.auto.prototype`

After the experience is validated against an eligible Android Auto category and passes DHU testing, the final integration strategy can be revisited.

## Current technical baseline

- Android Auto projected experience.
- Android for Cars App Library 1.7.0 (stable).
- Car App API minimum level 1.
- POI category for the lab because this prototype is specifically about airports/hotels/destinations relevant to driving.
- Production publishing is intentionally out of scope.
