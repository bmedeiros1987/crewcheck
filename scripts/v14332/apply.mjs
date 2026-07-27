import fs from 'node:fs';

const platformPath = 'server/platform.mjs';
const oldQuery = "  const staysResult = permissions.hotels ? await db.query('SELECT id,stay_date,hotel_name,airport,room_cipher,presentation_time,lead_minutes,share_with_visitors FROM crewcheck_platform_stays WHERE owner_email=$1 AND share_with_visitors=TRUE ORDER BY stay_date LIMIT 90', [identity.ownerEmail]) : { rows: [] };";
const newQuery = "  const staysResult = permissions.hotels && rosterRow?.roster_key ? await db.query('SELECT id,stay_date,hotel_name,airport,room_cipher,presentation_time,lead_minutes,share_with_visitors FROM crewcheck_platform_stays WHERE owner_email=$1 AND roster_key=$2 AND share_with_visitors=TRUE ORDER BY stay_date LIMIT 90', [identity.ownerEmail, rosterRow.roster_key]) : { rows: [] };";

if (!fs.existsSync(platformPath)) throw new Error('[v14332] Arquivo ausente: server/platform.mjs');
const source = fs.readFileSync(platformPath, 'utf8');

if (source.includes(newQuery)) {
  console.log('[v14332] Visitante já limitado aos pernoites da escala ativa; repetição segura ignorada.');
} else {
  if (!source.includes(oldQuery)) throw new Error('[v14332] Âncora ausente: consulta de pernoites do visitante');
  fs.writeFileSync(platformPath, source.replace(oldQuery, newQuery), 'utf8');
  console.log('[v14332] Visitante limitado aos pernoites compartilhados da escala ativa.');
}
