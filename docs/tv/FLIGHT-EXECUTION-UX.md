# CrewCheck TV — Flight Execution / Crew Operations Assistant

The television is an extension of CrewCheck, never the authoritative roster editor.

## Navigation contract

Scale -> Day -> Program -> Details

- Month/day surfaces summarize; they never collapse a multi-leg journey into the first leg.
- A program groups canonical activities by journeyId.
- Flight programs show the complete ordered route and all published legs.
- Stay is a first-class program with a moon/bed/hotel identity; it must never reuse the airplane visual language.
- Details are contextual and lazy: Operation, Weather, Hotel, Crew, Financial.
- Crew and financial tabs are private-only and require explicit sharing consent from the phone.
- Family/Visitor never receives those fields.

## Home contract

Show only what changes the next action:
- published presentation;
- CrewCheck leave-home recommendation when valid;
- traffic freshness / travel time when available;
- confirmed gate / remote stand with source/freshness;
- weather for origin/base and next stay;
- meaningful roster change.

Never invent gate, traffic, presentation, hotel, crew, finance or weather.

## Personalization

The phone owns TV preferences:
- visible home modules;
- automatic rotation modules;
- sensitive-detail grants;
- airline artwork;
- music;
- screen care;
- visitor mode.

TV local preferences are cosmetic/fallback only.

## Visitor mode

Visitor mode translates aviation shorthand without exposing private roster data:
- IATA airport code -> city/airport name;
- ICAO code -> readable airport when known;
- operational codes -> plain-language labels;
- local times are labeled;
- route and high-level status only.

## Ride handoff

TV does not silently order transportation. "Uber" creates a phone handoff (QR/deep link) with pickup/drop-off context. Any booking/payment confirmation happens on the rider's phone or an explicitly authorized Uber flow.

## Airline imagery

Prefer licensed/owned airline artwork or an airline-provided asset. Never scrape arbitrary copyrighted aircraft photography. Always retain a premium generic CrewCheck fallback.
