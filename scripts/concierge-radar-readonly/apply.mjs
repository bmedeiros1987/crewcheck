import fs from 'node:fs';
const file = 'server.mjs';
let source = fs.readFileSync(file, 'utf8');
const importLine = "import { radarReadReply } from './server/concierge/radar-readonly.mjs';";
if (!source.includes(importLine)) source = importLine + '\n' + source;
const anchor = '  if (stayMenu.handled) return stayMenu.reply;';
const adapter = `${anchor}\n  const savedRadar = await radarReadReply(text, profile, snapshot);\n  if (savedRadar.handled) return savedRadar.reply;`;
if (!source.includes(adapter)) {
  if (!source.includes(anchor)) throw new Error('[concierge-radar-readonly] final wrapper missing');
  source = source.replace(anchor, adapter);
}
// Semantic rewrite can discard dates and infer LA for a bare number. Intercept
// original Radar text before that rewrite; no provider, roster write or GPS.
fs.writeFileSync(file, source);
console.log('[concierge-radar-readonly] owner-scoped saved Radar/follows; no provider or transport calls');
