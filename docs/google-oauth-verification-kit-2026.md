# CrewCheck — Google OAuth Verification Kit (2026)

Project: `sonic-charmer-399015`  
Project number: `777637106343`  
Feature under review: export and synchronize the user's imported crew roster with Google Calendar.

## Final production configuration

| Field | Value |
|---|---|
| App name | CrewCheck |
| Homepage | `https://crewcheck.online/about` |
| Privacy policy | `https://crewcheck.online/privacy` |
| Terms of service | `https://crewcheck.online/terms` |
| Account deletion | `https://crewcheck.online/delete-account` |
| Authorized domain | `crewcheck.online` |
| Requested scope | `https://www.googleapis.com/auth/calendar.events.owned` |

Remove the legacy scopes `calendar.events`, `calendar.calendarlist.readonly` and `calendar`. The least-privilege implementation uses only the user's primary calendar and therefore does not need CalendarList access.

## Scope justification — English

> CrewCheck uses `https://www.googleapis.com/auth/calendar.events.owned` solely for the user-facing Google Calendar synchronization feature. After a user imports their own crew roster, they may explicitly choose Calendar > Google Calendar > Connect/Sync. CrewCheck then creates roster events in the authenticated user's primary calendar, searches only the roster date range to locate events previously created by CrewCheck, and updates or deletes only events tagged with CrewCheck private extended properties or the `#CREWCHECK` marker. A read-only scope is not sufficient because the user explicitly requests creation, replacement and deletion of their roster events. The broader `calendar.events` scope is not necessary because CrewCheck does not need to modify events on shared calendars, and CalendarList scopes are not requested because the app uses only the primary calendar. Google user data is not used for advertising, credit decisions, sale, profiling or general AI/ML model training.

## Reviewer navigation

1. Open `https://crewcheck.online/about`.
2. Review the Google Calendar feature and open the Privacy Policy and Terms.
3. Open `https://crewcheck.online/login` and sign in with the test account supplied privately in the verification form.
4. Import the supplied synthetic roster PDF.
5. Open **Calendário** > **Google Calendar**.
6. Click **Conectar Google Calendar**.
7. Authorize the single requested permission.
8. Click **Sincronizar agora**.
9. Open the Google Calendar test account and verify the new CrewCheck events.
10. Import a second synthetic roster version and synchronize again to demonstrate update and deletion without changing an unrelated personal event.

The review account must not be blocked by payment, telephone confirmation, corporate authentication or a subscription requirement. Never publish access credentials in the video or repository.

## Demo video setup

- Record one continuous desktop demonstration at 1080p or higher.
- Set the browser and Google account language to English.
- Keep the consent text readable and click **Show all services** when available.
- Use a clean test account containing only synthetic data.
- Upload to YouTube as **Unlisted** or **Public**.
- Do not expose tokens, real roster data, employee IDs or unrelated personal calendar content.

## Storyboard and English narration

### 00:00–00:25 — Public homepage

Show `https://crewcheck.online/about`, the CrewCheck identity and the Calendar feature.

> This is CrewCheck, a roster organization application for aviation crew members. The Google Calendar integration is an optional user-facing feature that exports a roster imported by the user into that user's primary Google Calendar.

### 00:25–01:05 — Privacy, Terms and Limited Use

Open `/privacy` and show the Google data, use, transfer, security, retention, deletion and Limited Use sections. Open `/terms` and show the Calendar section.

> Our public privacy policy explains exactly what Google Calendar event data is accessed, how it is used, protected, retained and deleted, and how access can be revoked. Google user data is not sold, used for advertising, credit decisions or general AI model training.

### 01:05–01:35 — Test access

Sign in with the reviewer account. Show that the integration is accessible without a paid plan or other blocking step.

> I am signing in with the authorized test account supplied in the verification submission. The reviewer can access this environment without payment or a corporate account.

### 01:35–02:05 — Import a synthetic roster

Import the test PDF and show the parsed dates and events.

> The user imports their own roster. No Google permission is requested during registration or import because the Calendar integration has not yet been selected.

### 02:05–02:35 — Incremental authorization entry point

Open **Calendário**, show the Google Calendar card and click **Connect**. Show the CrewCheck disclosure.

> Authorization is incremental and user initiated. CrewCheck requests Google access only after the user explicitly opens the Calendar feature and chooses to connect.

### 02:35–03:20 — Complete Google consent flow

Select the Google test account. Show the complete consent screen in English, expand all services and keep the permission readable. The screen must show only the permission corresponding to `calendar.events.owned`.

> CrewCheck requests one narrow scope: permission to see, create, change and delete events only on Google calendars owned by the authenticated user. The scope displayed here exactly matches the scope configured in Google Cloud Console and requested by the application.

### 03:20–04:10 — Event creation

Click **Synchronize now**, show the CrewCheck result, then open Google Calendar and show the generated events.

> The authorized scope is used to create roster events in the user's primary calendar. The events contain only the schedule information selected by the user and are marked internally as CrewCheck events.

### 04:10–05:05 — Update and delete impact

Create one unrelated event named “Personal event — do not change.” Import the second synthetic roster version and synchronize again. Show that CrewCheck events were replaced or removed and the unrelated event remains unchanged.

> CrewCheck searches only the roster period and deletes or replaces only events identified by CrewCheck private properties or the CrewCheck marker. This demonstrates the write and delete impact in the source Google account. Unrelated personal events are not modified.

### 05:05–05:35 — Disconnect and revoke

Disconnect in CrewCheck and show the Google Account connections page.

> The user can disconnect within CrewCheck and revoke access from their Google Account. Revocation prevents future synchronization. Existing events remain under the user's control.

### 05:35–05:55 — Account deletion

Open `/delete-account` without deleting the reusable reviewer account.

> CrewCheck also provides a public account and data deletion page. Deleting the CrewCheck account is separate from revoking Google authorization, and both options are documented.

### Closing

> This concludes the demonstration of the single requested Google Calendar scope and all associated user-facing functionality. The scope requested by the application, the OAuth consent screen and the Google Cloud verification submission are identical.

## Final checklist

- [ ] Production URL and CrewCheck branding are visible.
- [ ] Homepage is public and is not only a login screen.
- [ ] Privacy Policy and Terms are public without authentication.
- [ ] Consent screen is in English and all services are expanded.
- [ ] Only `calendar.events.owned` appears.
- [ ] The same exact scope is configured in Cloud Console and source code.
- [ ] Creation, replacement and deletion are visible in the source Google Calendar account.
- [ ] An unrelated event remains unchanged.
- [ ] Disconnect, revocation and account deletion paths are shown.
- [ ] Video visibility is Public or Unlisted.
- [ ] No real personal or operational data is exposed.

## Suggested reply to Google

Subject: `OAuth verification update — CrewCheck / sonic-charmer-399015 / 777637106343`

> Hello Google Third Party Data Safety Team,
>
> Thank you for the verification checklist. We completed a full audit of CrewCheck and updated project `sonic-charmer-399015` (Project Number `777637106343`).
>
> The Google Calendar feature is production ready and is initiated only when a signed-in user explicitly selects Calendar > Google Calendar > Connect/Sync after importing their own roster.
>
> We removed the broader `calendar.events` and `calendar.calendarlist.readonly` scopes. CrewCheck now requests only:
>
> `https://www.googleapis.com/auth/calendar.events.owned`
>
> CrewCheck uses the user's primary calendar only. The permission is necessary to create, locate, update and delete the roster events requested by the user. A read-only scope cannot provide synchronization. CrewCheck searches only the roster date range and modifies only events tagged with CrewCheck private extended properties or the `#CREWCHECK` marker.
>
> Public pages:
>
> Homepage: https://crewcheck.online/about  
> Privacy Policy: https://crewcheck.online/privacy  
> Terms of Service: https://crewcheck.online/terms  
> Account deletion: https://crewcheck.online/delete-account
>
> The Privacy Policy describes the exact Google Calendar event data accessed, its user-facing purpose, transfers, security, retention, deletion, revocation and our Limited Use compliance. It expressly prohibits sale, advertising use, credit use and general AI/ML model training with Google Workspace user data.
>
> Unlisted demo video: `[INSERT VIDEO URL]`
>
> The video shows the complete OAuth flow in English, the single requested permission, event creation and re-synchronization, resulting changes in the source Google Calendar account, protection of unrelated personal events and revocation.
>
> Active reviewer access and exact navigation instructions were supplied privately in the verification submission. The test environment does not require payment or a corporate account to access the integration.
>
> Please let us know if any additional evidence is required.
>
> Best regards,  
> CrewCheck Team

## Recording warning

Do not record the final video until the production deployment, Google Cloud Console data-access configuration and consent screen all use the exact same single scope. If the consent screen still displays either legacy permission, remove the legacy scopes, revoke the old test grant, clear the local CrewCheck token and start with a clean authorization.
