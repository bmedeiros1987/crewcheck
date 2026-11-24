# Integrated release QA

This draft contains only the test workflow and fixtures. The runner rebuilds
product commit `0c8a333eb0d9baacaf395976f8138d07e31a4d23` from the public
#1374 head `43504832191cecdf19151f8f38b1f5c0277dc25f` and the attached review
patch. Both the commit and its raw tree
`b60449aea060b32afbfad3afb062f4bc3206ffef` are checked before materialization.
The patch contains the owner-scoped client cleanup and the server session
generation checks. It leaves billing and Telegram out of the composition.

Chromium runs with its sandbox enabled. The two account deletion flows use
the real handlers and a disposable MySQL instance with networking disabled.
The allowance suite uses the same compiled app and eight scenarios with
synthetic roster responses. All accounts, payroll entries, and rosters are
fictional. This workflow has no deployment or notification step.

Earlier runs remain evidence for their own trees. The [#1374 baseline
run](https://github.com/bmedeiros1987/crewcheck/actions/runs/45304309823/job/138144258278)
did not pass the deletion invariants. The [broader reference
composition](https://github.com/bmedeiros1987/crewcheck/actions/runs/45302280646/job/138137496050)
passed, but includes unrelated changes and is outside this candidate.

The exact product checks run before the cache VM fixture overlay. The
overlay affects only `scripts/regression-financial-calculation-cache.mjs`;
it supplies the new handler dependencies to the existing test and checks
that cleanup is requested only for the confirmed owner. It remains a
separate proposed test patch, with the product SHA and tree above unchanged.
