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

This v1 is intentionally comment-only. `REQUEST_TEST`/whitelisted local test execution is deferred until the transport is proven stable.

## GitHub token

Use a dedicated fine-grained token with the smallest practical scope for the repository. It needs to read the selected PR and its comments and create issue/PR comments. It does not need repository administration, Actions administration, branch protection, merge, or contents write.

Do not paste the token into chat, prompts, source files, `.env` committed to git, or Ollama.

For an initial PowerShell session:

```powershell
$env:GITHUB_TOKEN = 'YOUR_FINE_GRAINED_TOKEN'
```

Close the PowerShell session when finished to discard the process environment value.

## Local smoke test

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1 -Smoke
```

Expected response contains:

```text
[OLLAMA-AUDIT] CONTEXT_REQUIRED
```

No GitHub token is needed for the smoke test.

## Run against the dedicated bridge PR

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1 -Pr <PR_NUMBER>
```

For one polling cycle only:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1 -Pr <PR_NUMBER> -Once
```

For local validation without publishing the response:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_ollama_bridge.ps1 -Pr <PR_NUMBER> -Once -DryRun
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

Processed `request_id` values are stored locally in `.ollama-bridge-state.json`. Reusing the same request ID does not trigger another model call.

The state file contains request IDs/status/SHA only; it does not contain the GitHub token or full prompts.

## Current limitations

- v1 reads the first 100 comments of the dedicated sandbox PR;
- no `REQUEST_TEST` support yet;
- no local shell execution at all;
- no self-hosted GitHub runner;
- no automatic merge authority;
- Ollama PASS is additional evidence, never sufficient by itself to merge a P0 PR.

These restrictions are intentional for the first transport validation.
