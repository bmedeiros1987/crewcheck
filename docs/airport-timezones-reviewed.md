# Reviewed operational airport time zones

Review date: 2026-11-08. This bounded extension fixes FLN, NAT, VIX, JFK and LIS without changing personal base choices or the gate-query policy. Airport identity and administrative location are established separately from the IANA zone. The region association is explicit, not nearest-coordinate or fixed-offset inference.

## Evidence

- FLN / SBFL: [ANAC airport identity](https://www.anac.gov.br/en/concessions/sbfl-fln/) and [DECEA location Florianópolis/SC](https://aisweb.decea.mil.br/?codigo=SBFL&i=aerodromos). IANA assigns SC to America/Sao_Paulo.
- NAT / SBSG: [airport operator's 2024 noise report, IATA/ICAO identifiers](https://natal-airport.com/assets/zurich-natal-ptbr/media/content-page/blocks/files/NAT_Relat%C3%B3rioAnualRu%C3%ADdo2024.pdf) and [DECEA Natal/RN](https://aisweb.decea.mil.br/?codigo=SBSG&i=aerodromos). IANA assigns RN to America/Fortaleza.
- VIX / SBVT: [airport operator identity and Vitória/ES address](https://vitoria-airport.com.br/aeroporto-de-vitoria-vix/servicos) and [DECEA Vitória/ES](https://aisweb.decea.mil.br/?codigo=SBVT&i=aerodromos). IANA assigns ES to America/Sao_Paulo.
- JFK: [Port Authority facility location directory](https://www.panynj.gov/content/dam/corporate/payroll-information/revised-headers-and-descriptions-5-19-2021.pdf) identifies JFK Airport in Queens, New York. IANA America/New_York is the New York / Eastern zone.
- LIS: [ANA airport-code directory](https://www.ana.pt/sites/default/files/documents/companhias_a_operar_no_funchal.pdf) identifies LIS as Lisboa. IANA Europe/Lisbon covers mainland Portugal.
- Zone definitions: [IANA tzdb zone1970.tab](https://raw.githubusercontent.com/eggert/tz/main/zone1970.tab), rows America/Sao_Paulo (SC/ES), America/Fortaleza (RN), America/New_York and Europe/Lisbon (mainland Portugal), inspected on the review date. Intl applies the installed tzdb's historical and DST transitions; the table does not hard-code UTC offsets.

CPV's existing DECEA/IANA evidence and the existing 16 base mappings remain unchanged. Unknown airports remain unverified even with a supplied originTimeZone. This is not a worldwide airport catalogue. Other origins require separate evidence and review; do not guess their zones.

## Contract and regression

Run `node scripts/regression-radar-airport-timezones.mjs` and `node scripts/regression-radar-cpv-timezone.mjs` from a checkout with existing dependencies. The new regression bundles the actual canonical engine in memory, reads the actual Home fetchRadarSnapshot implementation and supplies a fake transport. No provider, credentials or real flight data are used.

It covers the five added airports, existing airports and an unknown origin through canonical occurrence binding and the actual caller; normalized codes; unchanged personal base choices; exact UTC occurrence rejection; origin midnight before/at/after; origin/device different calendar days; JFK/LIS DST 23/25-hour days; four device zones; malformed date/instant, unknown airport and invented event-zone inputs. Only the origin's published local day is admitted. Source admission remains required.

This shared catalogue also affects its existing consumers (including stays and Watch); it does not change their flags, call sites, account guards or source authority. Full raw/prepared regression and owner coordination are required before integration, including consumers in outstanding PRs such as #1202. There is no new provider, cadence, quota, flag, network lookup or display preference.
