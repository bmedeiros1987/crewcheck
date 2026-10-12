# MyCrewCare observed DOM contract

Read-only observation on 2026-10-11. These are **synthetic reconstructions**, not saved source HTML. Every account name, employee ID, username, booking ID, pairing ID, airport, hotel, provider, address, telephone number and itinerary date is invented. No cookies, tokens, hidden state or credentials were read or saved.

## Verified sources and scope

- Authenticated `https://api2.apicrewcare.com/LATAM/mytravel.aspx`, title `My Travel`: matching welcome display name, profile/logout links and two reservation cards.
- One card's visible RESERVATION link opened `/LATAM/reservation.aspx` with query keys `tripreservid` and `dutyperiodnumber`. Actual values are omitted.
- Explicitly authorized profile inspection at `https://api2.apicrewcare.com/LATAM/userprofile.aspx`: heading `Change Profile`; `input#employeeId` and `input#userName` visibly populated and readonly. No actual profile values are included.
- The browser was returned to authenticated My Travel and reservations were visibly rechecked. No save, booking, cancellation, feedback, configuration, sync activation or persistent-access action occurred.

## Identity

Visible welcome: `.header-login-container .login-container p.welcome`, containing `Welcome <display name>`. Display name alone is not a collision-resistant account binding.

Profile fields:
- `input#employeeId`: HTML type=number, visible, populated digit string, readonly, enabled. Keep its value as an identifier string. Label for=`employeeID` differs from actual input ID `employeeId`.
- `input#userName`: visible, populated string, readonly, enabled, no explicit type attribute. Label for=`username` differs from actual ID `userName`.
- Both are inside `div.col-xs-8.col-sm-8.col-md-8`, inside `div.form-group`.

Their global uniqueness, cross-tenant scope, immutability and behavior after switching accounts were not tested. Bind only after fresh same-session identity comparison; reject absent/ambiguous/mismatched identity. Do not substitute display names, feedback-link crew IDs or historical hardcoded numbers.

## Main-card contract

- Root `#layovers`, heading `Recent Reservations`; card `#layovers > .my-trips-box`.
- Airport `.airport-code-box > p`; date `p.mt-date` (which also contains links); location `p.mt-city`; pairing `p.mt-pairing-id`, prefix `Pairing ID:`.
- Reservation link `p.mt-date a[href^="reservation.aspx?"]`, image title `RESERVATION`.
- Content `.media` rows with `.media-body`, `p.mt-stay-head` and `p.mt-stay`.
- Hotel is identified by `p.mt-stay-head a[href^="hoteldetails.aspx?"]`; address and phone occupy separate `p.mt-stay` nodes; phone has a `tel:` link. `p.mt-stay-confirm` displayed `CONFIRMATION NUMBER: PLANNED`.
- Transport names are direct text in `p.mt-stay-head`, with phone in `p.mt-stay`. Two transport rows appeared around the hotel. Do not infer direction from order alone; details explicitly label direction.
- Main cards did not visibly expose pickup/check-in/out. Do not extract dates from feedback-link query strings as a substitute.

## Reservation-detail contract

Root `#main-content-scroll.container.white-container.main-content`, heading `Reservation`. Direct-child `.callout > p` labels and bodies:

1. `Arriving Flight`: `.callout.hr-icon-plane` followed by `p.hr-info`.
2. `Transportation To Hotel`: `.callout.hr-icon-transport` followed by `.row > .col-sm-6 > p.hr-info`.
3. `Hotel`: `.callout.hr-icon-hotel` followed by `p.hr-info`.
4. `Transportation To Airport`: `.callout.hr-icon-transport` followed by `.row > .col-sm-6 > p.hr-info`.
5. `Departure Flight`: `.callout.hr-icon-plane` followed by `p.hr-info`.

Transport provider is in `strong`; `br` separates `Phone:`, `Pick-up time:` and `Transit time:` lines. Pickup is HH:mm only; transit is an integer plus `minutes`.

Hotel name is `strong > a[href^="hoteldetails.aspx?"]`. Lines include `Phone:`, address, `Confirmation:`, `Check-In:` and `Check-Out:`. Flight and hotel datetimes visibly use d MMM yyyy HH:mm with English month abbreviations, without a displayed timezone. Confirmation said `Planned`; no separately labeled Status field was visible.

## Latest requested status display

Preserve raw source text. MyCrewCare `PLANNED`/`Planned` maps to `Planejada`; explicit `CANCELLED` maps to `Cancelada`. Include planned stays as applicable; do not display `Confirmada`. This supersedes earlier proposed confirmed wording. No cancelled record was observed; its DOM location/capitalization is unverified. Preserve unknown values instead of coercing them.

## Unresolved constraints and negative tests

- No timezone label was observed. Do not infer provider timezone from the cloud/browser timezone. Conversion needs a separately reviewed policy or more provider evidence.
- Pickup has no date. Do not anchor both directions to the main-card date. An overnight return is a later day. Flight/check-in/out dates may support candidate anchoring, but its rule must be explicit and ambiguity must fail closed.
- Pickup is not APZ/reporting time. Do not copy pickup to APZ, derive APZ from transit or overwrite schedule-derived APZ.
- Airport-to-hotel pickup is not hotel check-in. Hotel-to-airport pickup is not universally check-out. Keep separate fields even if a sample is equal.
- No authoritative empty-state message was observed. On return from profile, an immediate card count was zero; the next UI observation showed both cards. Zero alone must not clear existing reservations.
- Login, gateway error, loading, partial DOM and parse failure are not authoritative empty results.
- Missing data must not be borrowed from another card or section. Reject ambiguous joins.
- Missing, ambiguous or changed identity must prevent cross-account import. Same display name does not imply same account.
- Other tenants/locales/breakpoints, multiple hotels and cancelled/empty templates remain unverified.

The HTML omits nonessential assets, hidden elements, scripts, styles, weather and navigation. It preserves successfully observed selector-relevant structure, not a complete browser DOM. Synthetic cancelled/error tests would be behavioral tests, not provider evidence. This package does not establish that app integration is active.
