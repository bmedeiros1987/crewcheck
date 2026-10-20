# PDF module worker MIME follow-up

Post-publication synthetic QA found that the real server returned a generated PDF worker .mjs with application/octet-stream. The browser rejected its module import, so the local statement reader displayed an error. The same MIME rule existed before the period-history PR.

The runtime change recognizes .mjs alongside .js in the existing dist-only static responder. It does not change paths, authentication, permissions, security headers, cache behavior, document handling or financial calculations.

The financial browser regression now invokes the real production serveStatic function rather than a test-only MIME table. A separate regression reads that same function and verifies module/script/style/document/binary response types, unchanged bytes and cache headers. The published baseline fails for worker.mjs; the correction passes. All fixtures are synthetic.

This branch requires independent review and exact-head CI before publication. PR931 itself is merged and publicly serving its approved commit, with post-merge workflows complete; its published browser validation stopped at PDF loading. The reported actual payment discrepancy is unrelated to this MIME failure and remains unresolved.
