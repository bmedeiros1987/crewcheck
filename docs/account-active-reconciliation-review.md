# Account-active reconciliation review

Independent startup patch; base d54f1950. Finance PR925 and WhatsApp PR888 are outside this change.

Cold start retains the latest valid account import bootstrap. An already loaded roster can refresh from the authenticated account active endpoint on mount, focus, visible, online and a 60-second interval. This lifecycle does not write a roster to the server or introduce transport. Remote-only reads reject HTTP/application failures and cached fallbacks. The default existing reader remains compatible.

Automatic adoption requires the same period and authenticated owner/session. Known crew identities must agree; two legacy bodies without identity are scoped by authenticated account, without claiming person identity verification. A known summary identity cannot contradict the body. All asynchronous preparation precedes guarded local publication/cache writes. The publication guard runs inside the browser lock; a newer observation prevents an older response from committing. Manual choices, foreign-tab intent/completion, account/token changes, clear, changed roster and unmount invalidate pending reads. Explicit cache metadata records the choice intent so identical-content manual completion remains observable before a storage event. Compliance-only decoration does not invalidate a roster read.

Tests execute the prepared lifecycle and actual runtime helpers with synthetic data, including delayed browser locks, manual races, identical writes, rejected remote fallback, correction adoption and three timezones. Existing startup/latest-import/two-tab tests remain intact. Original browser PDF-import test runs against the actual compiled app and mock APIs. No production or reference-document data is committed.

Review before merge: inspect the generated effect/remote reader via canonical preparation; verify cold startup and loaded refresh remain separate, read-only, bounded, and owner fenced. CI must pass, including mobile account parity and menu/import browser regression. No merge/deploy authorization is implied.
