# Capacitor toolchain: minimatch alert33

Base: `96ac7558cfb127dd1614ea1fd852dd927d183df7`. This separate dependency correction does not compose or modify the frozen gate/provider work in #1310. That PR records historical triage, not a dependency fix. No open independent rimraf/minimatch correction was found in the repository searches. Work remains the implementation owner; Android/Watch feature branches and store releases remain separate.

## Evidence and scope

User-provided Dependabot evidence identifies alert33 as GHSA-g3hv-75wg-m249, affecting minimatch >=7.0.0 <11.0.1. No repeat of the denied private endpoint, dismissal or closure of the alert was performed. The public advisory describes attacker-controlled glob patterns with optimizationLevel>=2 causing excessive preprocessing CPU/memory. This does not prove exploitation in this application.

The base has exactly one lockfile copy: @capacitor/cli7.6.7 -> rimraf6.1.3 -> glob13.0.6 -> minimatch10.2.5. All are marked development-only. Actual installed CLI code uses rimraf for migration cleanup and iOS archive cleanup. Application/frontend/server sources do not directly import these packages. The Render build installs development dependencies, so build/toolchain exposure still matters; a production-only audit cannot substitute for checking the full graph. This patch changes no application or native runtime dependency, manifest, provider, flag, credential or permission.

## Compatible resolution

Update the existing rimraf6 range accepted by Capacitor7, using normal npm resolution (`npm update rimraf --package-lock-only --ignore-scripts --no-audit --no-fund`). Keep @capacitor/cli7.6.7 and package.json unchanged. No minimatch/glob major override or Capacitor major migration.

Effective lock and isolated npm-ci installation:

- rimraf6.1.4 requires glob^14.0.3;
- glob14.0.6 requires minimatch^11.0.5;
- minimatch11.0.8 (fixed range) resolves with @isaacs/nonrecursive-glob-match1.1.0;
- path-scurry3.0.0, lru-cache11.5.3 and brace-expansion5.0.13 are the associated transitive resolution changes.

There are no additional/nested minimatch copies. Package integrity hashes are preserved in the generated lock and checked by npm ci. Actual CLI resolution is tested, not inferred from the top-level npm listing. The existing root floor is Node>=22.13.0; Android/Wear CI, Docker and Render configuration use22.13.0. Every package in the changed chain accepts22.13.0; minimatch11.0.8/rimraf6.1.4 declare20||>=22. Actual local execution is22.23.4; execution on the configured minimum still requires exact-HEAD CI. No Node engine floor or workflow gate was changed.

## Validation contract

The existing development-dependency regression imports a new bounded test. It fails against the base lock, scans every nested minimatch entry, checks the actual Capacitor/rimraf/glob/minimatch resolution and Node engine compatibility, and exercises optimized/extglob/brace matching, pre-aborted traversal and asynchronous/synchronous scoped temporary-directory cleanup. No unbounded DoS workload or real project deletion is used. Existing brace/XML/tar assertions remain intact.

Isolated npm ci uses --ignore-scripts --no-audit --no-fund; no installation scripts, system packages or credentials. The explicit full and omit-dev lockfile npm audit snapshots both report zero across all severities. Audit transmits public package names/versions only; no private document, account or provider request. This is a dated advisory snapshot, not a permanent guarantee or confirmation that GitHub alert33 has closed.

CLI version and actual config loading preserve appId, webDir and native path selection. `cap ls` reports no native platform in this checkout. The maintained Android wrapper is a separate Gradle/WebView project, not an installed @capacitor/android platform; no cap add/migrate/sync was run or native project generated. Existing Play manual-publication guards and synthetic read-only preflight tests pass. Android assembly/device/store testing remains a separate gate; these read-only checks do not certify installed packages. Canonical preparation, TypeScript, web build and existing dependency regressions must pass; exact-SHA CI and independent review remain required before integration. No merge, deployment, store publication or real message/payment is authorized by this report alone.

Sources: [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), [glob cancellation advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), npm package metadata/integrities, actual installed Capacitor source and the repository lock/configuration. The normal rimraf update also removes glob13.0.6, affected by the separately documented cancellation advisory; the regression guards both known ranges.
