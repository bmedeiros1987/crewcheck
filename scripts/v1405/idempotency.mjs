import fs from 'node:fs';

function keepFirstBlock(source, pattern) {
  let occurrences = 0;
  return source.replace(pattern, (block) => {
    occurrences += 1;
    return occurrences === 1 ? block : '';
  });
}

const calendarPath = 'client/src/lib/googleCalendarSync.ts';
if (fs.existsSync(calendarPath)) {
  let calendar = fs.readFileSync(calendarPath, 'utf8');

  // O preparo de fonte pode ser executado por check, build, start e ferramentas locais.
  // Mantenha apenas uma importação da ponte OAuth e uma função de detecção de origem.
  calendar = keepFirstBlock(
    calendar,
    /import \{\n(?:  [A-Za-z0-9_]+,\n)+\} from '\.\/googleCalendarOAuthBridge';\n*/g,
  );
  calendar = keepFirstBlock(
    calendar,
    /function isProductionGoogleOrigin\(\): boolean \{\n  try \{\n    const host = window\.location\.hostname\.toLowerCase\(\);\n    return host === 'crewcheck\.online' \|\| host === 'www\.crewcheck\.online' \|\| host\.endsWith\('\.onrender\.com'\);\n  \} catch \{ return true; \}\n\}\n*/g,
  );

  const bridgeImports = (calendar.match(/from '\.\/googleCalendarOAuthBridge';/g) || []).length;
  const productionOriginFunctions = (calendar.match(/function isProductionGoogleOrigin\(\): boolean/g) || []).length;
  if (bridgeImports !== 1) throw new Error(`CrewCheck v14.0.5: ponte OAuth duplicada ou ausente (${bridgeImports}).`);
  if (productionOriginFunctions !== 1) throw new Error(`CrewCheck v14.0.5: detector de origem duplicado ou ausente (${productionOriginFunctions}).`);

  fs.writeFileSync(calendarPath, calendar, 'utf8');
}

const serverPath = 'server.mjs';
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, 'utf8');
  server = server.replace(
    /(\n\s*googleCalendarOAuthReliability\(\),){2,}/g,
    '\n    googleCalendarOAuthReliability(),',
  );
  fs.writeFileSync(serverPath, server, 'utf8');
}

console.log('CrewCheck v14.0.5: aplicação OAuth idempotente validada no cliente e servidor.');
