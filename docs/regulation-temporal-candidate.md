# Local regulation temporal candidate

Based on published main 3373a125. This isolated branch changes the calculator UI and adds a Home shortcut; it does not change the global regulatory engine, operational roster or legal limits.

The result compares a projected duty end with an explicitly reviewed normal duty-end reference. Takeoff, airborne time, taxi, post-flight and additional tasks remain distinct. Selecting +1 hour adds 60 minutes only to the scenario duty-end reference. Delay moves takeoff. Landing, final engine stop and duty end are shown separately. Exact equality fits the supplied temporal reference; one minute over exceeds it. This never grants operational authorization.

Timezone starts blank and must be explicit. Taxi and additional tasks must be entered, including explicit zero. The optional existing B.1 engine reference requires simple crew, reported acclimatization, valid published report time and explicit confirmation of its timezone. It preserves that timezone, and still requires review of applicability. Unknown acclimatization remains indeterminate. Manual LATAM/SGRF, rest, nights, accumulated limits and regulatory authorization remain unverified.

Inputs and detailed source/version explanation are under Ver cálculo. Drafts live in memory and reset on owner/session or selected-day changes; no simulation write API or roster persistence exists. Navigation reuses the existing contextual return mechanism. The prior calculator component is retained as an unmounted compatibility anchor for canonical preparation; the default export mounts only the new scenario view.

Sources shown in the UI: Lei 13.475/2017 arts.35§4 and40; RBAC117 EMD01 effective01/08/2024,117.3(n)(4),B117.17(b); ACT LATAM cabin2025/2027 clause3.3.1 is remuneration, not authorization. Reference images are visual examples only and excluded from Git.

Validation: pure synthetic temporal boundaries, equivalent timezone instants, invalid calendars/offsets, date crossing, missing inputs and immutable base; existing canonical measurement/navigation regressions; TypeScript/build; compiled browser in390/light and1440/dark under Sao Paulo and Tokyo. Browser intercepts every API and external request, separately records existing telemetry/installation attempts, and requires zero other write attempts. Browser checks keyboard Home shortcut and48px area, result-first/details, confirmed-offset preservation, unknown acclimatization, separate timestamps, exact/excess boundary, missing taxi, unchanged roster/legacy storage and owner reset. Independent code review closes explicit-offset/published-report/acclimatization findings. This is local evidence, not normative or physical-device certification.

No push, deploy, production migration or production data write is authorized by this candidate.
