import fs from 'node:fs';
import {composeHeldInfobipRoute} from './compose.mjs';
export {composeHeldInfobipRoute} from './compose.mjs';

const file = 'server.mjs', before = fs.readFileSync(file, 'utf8');
const after = composeHeldInfobipRoute(before);
if (after !== before) fs.writeFileSync(file, after);
console.log('[infobip-whatsapp-off] sealed OFF runtime composed; no configuration or I/O');
