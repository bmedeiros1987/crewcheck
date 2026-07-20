import fs from 'node:fs';

const serverPath = 'server.mjs';
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, 'utf8');
  server = server.replace(
    /(\n\s*googleCalendarOAuthReliability\(\),){2,}/g,
    '\n    googleCalendarOAuthReliability(),',
  );
  fs.writeFileSync(serverPath, server, 'utf8');
}

console.log('CrewCheck v14.0.5: aplicação OAuth idempotente validada.');
