import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "index.ts"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(here, "openclaw.plugin.json"), "utf8"));

assert.deepEqual(manifest.contracts.tools, ["crewcheck_concierge_read"]);
assert.equal(manifest.toolMetadata.crewcheck_concierge_read.optional, true);

assert.match(source, /toolContext\.requesterSenderId/, "identity must come from trusted OpenClaw runtime context");
assert.match(source, /CREWCHECK_OPENCLAW_BINDINGS_JSON/, "sender-to-token binding must be server-side");
assert.match(source, /authorization.*Bearer/s, "backend call must use a scoped linked credential");
assert.match(source, /\/api\/telegram\/concierge\/ask/, "adapter must reuse the existing Concierge facade");
assert.match(source, /body: JSON\.stringify\(\{ text: question \}\)/, "model may send only the question");
assert.doesNotMatch(source, /parameters:[\s\S]{0,300}(email|userId|workspaceId|token)\s*:/, "model must not choose identity or credentials");
assert.doesNotMatch(source, /\/api\/(platform\/rosters\/sync|alarm\/schedule|alarm\/cancel|auth\/)/, "adapter must not call mutating/auth endpoints");

console.log("[openclaw-crewcheck] PASS — trusted sender binding + read-only facade are enforced.");
