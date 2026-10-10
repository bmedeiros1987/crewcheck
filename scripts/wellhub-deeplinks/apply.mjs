import fs from 'node:fs';
const change=(file,fn)=>{let s=fs.readFileSync(file,'utf8');const n=fn(s);if(n!==s)fs.writeFileSync(file,n);};
const required=(s,before,after)=>{if(!s.includes(before))throw Error('[wellhub-deeplinks] missing anchor: '+before);return s.replace(before,after);};
change('client/src/App.tsx',s=>s.includes('// cc-wellhub-unit-route')?s:required("import WellhubUnitPage from './pages/WellhubUnitPage';\n// cc-wellhub-unit-route\n"+s,'  return <Switch>','  return <Switch>\n    <Route path="/academias/unidade/:id">{(params) => <WellhubUnitPage id={params.id}/>}</Route>'));
change('server.mjs',s=>{
 if(s.includes('// cc-wellhub-unit-transport'))return s;
 s="import { loadVerifiedWellhubPartners } from './server/v14407/wellhub.mjs';\nimport { wellhubTelegramMessage } from './shared/wellhub-unit-actions.mjs';\nimport { handleWellhubUnitRoute } from './server/wellhub/unit-actions.mjs';\n// cc-wellhub-unit-transport\n"+s;
 s=required(s,"  if (url.pathname === '/api/wellhub/search')", "  if (url.pathname.startsWith('/api/wellhub/unit/')) return handleWellhubUnitRoute(req, res, url);\n  if (url.pathname === '/api/wellhub/search')");
 return required(s,"    const payload = { chat_id: chatId, text: String(text || '').slice(0, 3900), disable_web_page_preview: true, ...extra };", "    const raw = String(text || '');\n    const rich = !extra.parse_mode && !extra.entities && /^Academias · /.test(raw) ? wellhubTelegramMessage(raw, loadVerifiedWellhubPartners()) : { text: raw, entities: [] };\n    const payload = { chat_id: chatId, text: rich.text.slice(0, 3900), disable_web_page_preview: true, ...extra, ...(rich.entities.length ? { entities: rich.entities } : {}) };");
});
change('server/whatsapp.mjs',s=>{
 if(s.includes('// cc-wellhub-unit-plain'))return s;
 s="import { loadVerifiedWellhubPartners } from './v14407/wellhub.mjs';\nimport { wellhubPlainMessage } from '../shared/wellhub-unit-actions.mjs';\n// cc-wellhub-unit-plain\n"+s;
 return required(s,"  const body = String(text || '').trim().slice(0, 4000);", "  const raw = String(text || '').trim();\n  const body = (/^Academias · /.test(raw) ? wellhubPlainMessage(raw, loadVerifiedWellhubPartners()) : raw).slice(0, 4000);");
});
