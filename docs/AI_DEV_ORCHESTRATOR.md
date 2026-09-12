# Internal AI Dev Orchestrator

The AI Dev Orchestrator is an internal, local-first engineering review CLI. It has no HTTP route and is not wired into operational CrewCheck behavior. It sends the same already-sanitized engineering packet to enabled OpenRouter, Cloudflare Workers AI and Gemini providers concurrently, then produces one deterministic advisory report.

It never authorizes merge, replaces CI or security/compliance gates, changes roster/APZ/compliance calculations, or makes regulatory decisions. A report always contains `advisoryOnly: true`, `mergeAuthorized: false` and `gatesReplaced: false`.

## Accepted input

Provide a local JSON file containing only sanitized `diff`, `test`, `log` or `documentation` artifacts:

```json
{
  "objective": "Review bounded retry behavior",
  "items": [
    { "type": "diff", "label": "gateway.patch", "content": "+ retryCount += 1" },
    { "type": "test", "label": "ai-gateway", "content": "12 tests passed" }
  ]
}
```

Run it only from a trusted engineering workstation or private CI job:

```sh
npm run ai:dev:review -- ./sanitized-review.json
```

The existing runtime provider variables and feature flags select providers. The global kill switch is honored, and a provider marked as `strong` also requires `AI_ALLOW_PAID=true`. `AI_DEV_TIMEOUT_MS` optionally sets a per-provider timeout (default 30000 ms). Provider calls run in parallel and failures are isolated, so a successful independent review remains available.

## Mandatory privacy boundary

Sanitize before constructing the file. The CLI also fails closed on suspicious fields and recognizable secrets, credentials, direct identifiers, raw roster/flight records, CrewLife/Fem data, and raw compliance/APZ/regulatory material. This second check is defense in depth, not a substitute for source-side minimization. Do not paste production payloads or database exports.

The report groups identical findings as `consensus`, provider-specific findings as `divergences`, and keeps `risks`, `suggestions` and `evidence` with provider attribution. Model output is untrusted advisory material: verify every claim against the referenced artifact and normal repository gates.

## Roadmap and PR discipline

This tool is an isolated development slice on the draft hybrid gateway branch. Keep PR #653 draft and do not merge this slice ahead of #623. A reviewer must re-run repository CI on the exact final SHA; the orchestrator result is never a merge gate or approval.
