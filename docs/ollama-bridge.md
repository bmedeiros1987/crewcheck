# CrewCheck Ollama Bridge

Local relay for using a local Ollama model as an additional adversarial auditor without giving the model GitHub credentials, shell access, browser access, or merge authority.

## Security boundary

```text
GitHub PR comments
      |
      v
trusted local bridge (GITHUB_TOKEN lives here only)
      |
      v
http://127.0.0.1:11434/api/chat
      |
      v
Ollama text-only model
```

The model receives only the explicit audit prompt. The bridge never forwards `GITHUB_TOKEN`, never executes commands requested by the model, never changes repository code, never merges, and checks the PR head SHA immediately before and immediately after the model call.

The daemon now watches every open PR in `bmedeiros1987/crewcheck` by default. It only acts on explicit top-level `[OLLAMA-REQUEST]` comments from the allowed GitHub author. That keeps the model from auditing arbitrary text or consuming local resources just because a PR exists.

`REQUEST_TEST`/whitelisted local test execution remains deferred; the bridge is comment-only.

## GitHub token

Use a dedicated fine-grained token with the smallest practical scope for the repository. It needs to read pull requests/comments and create issue/PR comments. It does not need repository administration, Actions administration, branch protection, merge, or contents write.

Recommended repository permissions:

- repository access: only `bmedeiros1987/crewcheck`;
- Pull requests: Read-only;
- Issues: Read and write;
- Metadata: Read-only.

Do not paste the token into chat, prompts, source files, `.env` committed to git, or Ollama.

For a PowerShell session:

```powershell
$env:GITHUB_TOKEN = 'YOUR_FINE_GRAINED_TOKEN'
```

Close the PowerShell session when finished to discard the process environment value.

## Local smoke test

From the bridge worktree:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1 -Smoke
```

Expected response contains:

```text
[OLLAMA-AUDIT] CONTEXT_REQUIRED
```

No GitHub token is needed for the smoke test.

The PowerShell launcher prefers a working `py -3` and falls back to a working `python`, avoiding the Windows Store alias problem.

## Watch all open PRs

This is the normal operating mode. No PR number is needed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1
```

The process stays open, polls the repository, and handles requests from any currently open PR. One bridge process is enough for the repository.

To perform only one polling cycle:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1 -Once
```

To validate locally without publishing or recording the request as processed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1 -Once -DryRun
```

## Restrict to a single PR

Targeted mode remains available for troubleshooting:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1 -Pr 605
```

## Request protocol

Only top-level comments by the configured allowed GitHub author are accepted. Default allowed author is `bmedeiros1987`.

```text
[OLLAMA-REQUEST]
request_id: rolling-001
sha: <EXACT_40_CHAR_PR_HEAD_SHA>
prompt:
<<<PROMPT
Your exact audit prompt goes here.
The prompt itself should require one of the allowed response formats and bind the answer to the same SHA.
PROMPT>>>
```

The request is rejected/staled if its SHA is not the current PR head.

## Allowed model responses

```text
[OLLAMA-AUDIT] OLLAMA: PASS — SHA <sha>
...
```

```text
[OLLAMA-AUDIT] OLLAMA: BLOCKER — SHA <sha>
...
```

```text
[OLLAMA-AUDIT] CONTEXT_REQUIRED — SHA <sha>
...
```

Responses without the exact requested SHA or outside the protocol are published as `INVALID`, not treated as evidence.

If the PR head moves while Ollama is reasoning, the result is discarded and the bridge publishes `STALE`.

## Idempotency

Processed requests are stored locally in `.ollama-bridge-state.json` under a key composed of `PR_NUMBER:request_id`, so the same request ID may safely exist on different PRs.

`-DryRun` does not mark a request as processed and does not publish to GitHub.

The state file contains request IDs/status/SHA only; it does not contain the GitHub token or full prompts.

## Operational model

The bridge does not blindly send every PR diff to Ollama. ChatGPT/Claude/Manus or the operator can place a bounded `[OLLAMA-REQUEST]` on any PR, and the single daemon will pick it up automatically. This prevents giant prompts from overrunning the local 4096-token model context and keeps audit scope explicit.

Ollama remains additional adversarial evidence. `PASS` does not grant merge authority, and a reproducible blocker still requires adjudication through the normal CrewCheck gate.
