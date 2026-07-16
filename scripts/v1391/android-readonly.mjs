import fs from 'node:fs';

const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
let source = fs.readFileSync(path, 'utf8');
const before = "function isDangerText(t){ return /send|logout|sign out|sair|create account|delete|remove/i.test(String(t||'')); }";
const after = "function isDangerText(t){ return /send|logout|sign out|sair|create account|delete|remove|acknowledge|acknowledgement|accept schedule|confirm schedule|aceitar programa|aceitar programação|ciente|dar ciência|dar ciencia|aprovar programação/i.test(String(t||'')); }";

if (source.includes(before)) source = source.replace(before, after);
source = source.replaceAll('13.9.0', '13.9.1');
source = source.replace('Calendar Sweep admin ativado.', 'Leitura do calendário ativada em modo somente leitura.');
fs.writeFileSync(path, source, 'utf8');
