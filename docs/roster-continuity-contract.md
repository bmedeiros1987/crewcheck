# CrewCheck roster continuity contract

## Goal

A CrewCheck user should use the product, not administer its storage. Once a roster has been accepted and made active for an account, reinstalling a client, opening another device, returning from offline mode, or receiving a newer roster from another authorized channel must not require importing the same PDF again.

## Source of truth

The account-scoped active roster in the CrewCheck backend is authoritative. Device storage is a resilient read replica/cache, not the ownership boundary for the roster.

The server already enforces one active roster per account when saving a roster and exposes the active record through the active-roster API.

## Client behavior

After authentication, Web/PWA/Android must:

1. render a valid local roster immediately when one exists;
2. request the account's active roster on mount;
3. retry during cold-start stabilization;
4. reconcile again on focus, foreground/visibility, network recovery and native-ready;
5. reconcile periodically while open;
6. replace the local replica only when a valid remote active roster differs by canonical fingerprint;
7. preserve the local replica on network/backend failures;
8. publish the resulting canonical roster to downstream surfaces such as Watch only through the normal shared snapshot flow.

A reinstall may require authentication again because uninstalling an Android app removes app-owned local credentials. After login, however, a roster that already exists in the account must repopulate automatically; the user must not be asked to provide the PDF again.

## Crewtopia ingestion

Crewtopia must not become a second device-local roster store.

The intended pipeline is:

```
Crewtopia authorized feed
        |
        v
CrewCheck server ingestion / validation
        |
        v
account active roster (canonical)
        |
        +--> Mobile / PWA reconciliation
        +--> CrewWatch snapshot
        +--> CrewCheck TV
        +--> Concierge / other authorized surfaces
```

The Crewtopia adapter should normalize and validate the incoming roster, record source/provenance, then use the same account-level active-roster persistence semantics as PDF/other authorized ingestion channels. Clients should not need Crewtopia credentials or polling logic merely to display the active roster.

## Blank-screen / update resilience

Android packages a canonical web shell. The native wrapper additionally verifies that the UI actually mounts. If the shell remains blank, it may clear WebView navigation cache and reload, but must not clear cookies, localStorage, authentication state or roster data.

The PWA update coordinator activates a waiting service worker only at a safe boundary and reloads once after the new controller takes over, preventing a long-running client from staying pinned to an old shell indefinitely.
