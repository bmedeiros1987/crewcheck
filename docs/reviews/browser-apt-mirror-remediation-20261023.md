# Browser dependency installation remediation

The initial summary that npm had stalled was incorrect. Full logs distinguish two commands in one workflow step:

- Passing job 120464948982: Node22.23.3/npm10.9.9, cache key node-cache-Linux-x64-npm-c8206fb5dfb859719b15b6a84a7218ca02150570b1c551ed8bacea9e142a7f0a; npm added two packages in1s at14:19:55; Playwright OS packages and browser downloads followed successfully.
- Cancelled job120472602406: identical Node/npm/cache key and Playwright1.55.0. npm added two packages in1s at14:36:39. The subsequent Playwright --with-deps invocation used APT's Azure archive mirror. Downloads trickled for minutes: fonts-freefont5.6MB14:38:38, fonts-wqy7.4MB14:42:06, libcodec2 8.9MB14:45:34 followed by Ign14:49:19. The job was cancelled at14:56:02 before UI tests ran.

GitHub runner configuration already includes HTTPS archive.ubuntu.com and security.ubuntu.com as signed Ubuntu fallbacks, after Azure's priority1 entry:
https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh

The runner project tracks the same slow-but-not-stalled behavior; the ordinary inactivity timeout cannot detect a continuously trickling transfer:
https://github.com/actions/runner-images/issues/14823

The remediation removes only the exact Azure mirror entry from the ephemeral runner's mirror list, retaining existing HTTPS Ubuntu fallbacks byte-for-byte. It refuses a list without the expected Ubuntu HTTPS archive instead of inventing a new source. Package lists, distribution, signature verification, npm cache/lock/dependency versions, Playwright1.55.0, Chromium/WebKit install command, test commands, job timeout20min and repository permissions remain unchanged. No existing failed job is rerun by this change.

Three offline fixture tests cover the hosted-runner list, idempotence, HTTPS Azure variants, preservation of comments/metadata, and missing/lookalike fallback rejection. Local environment is macOS without Docker; Linux APT installation cannot be reproduced locally. The new CI commit must demonstrate the mirror selection and all unchanged browser checks before release. This is new remediation evidence, not approval to bypass a failed gate or the denied rerun.

The same cause was confirmed in Weather theme browser run39976602723/job120492718992: npm added two packages in2s at15:16:47; APT then trickled Azure archive downloads until cancellation15:35:36. The already tested mirror-selection step is reused there, with both helper paths included in its trigger filter. The menu gate on03303f52 completed successfully with all original tests. No timeout or test command is changed in either workflow.

Wellhub run39980110850/job120504875100 subsequently confirmed the same source failure: APT repeatedly downloaded/ignored fonts from azure.archive.ubuntu.com and cancelled15:51:58 before tests. Restricting the remedy to menu/weather therefore left the same shared dependency bootstrap exposed in other required gates. The verified mirror setup is now applied consistently to all32 existing Ubuntu Playwright --with-deps jobs. Existing workflow events, tests, package/browser versions, permissions and timeouts are preserved. No workflow dispatch or mobile/Play writer is invoked.

A coverage guard verifies every existing caller has mirror preparation before installation and includes helper/test trigger paths where the workflow already has a pull_request.paths filter. All workflow YAMLs parse with the local Ruby standard YAML parser. The machine-readable preservation report records an exact round-trip comparison for all32 workflows: deleting only the new helper setup and helper trigger paths restores every original workflow byte. This is infrastructure source remediation, not a retry or gate waiver. Application/source blobs remain those already validated on main2e2045fd.
