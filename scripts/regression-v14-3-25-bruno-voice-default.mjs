import fs from 'node:fs';

const source = fs.readFileSync('scripts/v14325/apply.mjs', 'utf8');
for (const marker of [
  "pNZa0DWwl4bXevTwyjr0",
  "CREWCHECK_ALLOW_DANIEL_VOICE",
  "explicitProfile === 'daniel'",
  "patch('server.mjs')",
  "patch('elevenlabs_tts_1377.js')",
]) {
  if (!source.includes(marker)) throw new Error(`Bruno voice guard ausente: ${marker}`);
}
console.log('CrewCheck v14.3.25 Bruno voice default OK');
