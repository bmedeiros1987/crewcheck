import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {build}=createRequire(process.env.CHT_TEST_DEPENDENCIES_PACKAGE||import.meta.url)('esbuild');
const out=await build({entryPoints:['client/src/lib/crewlockerChtText.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {parseChtText,mergeChtEntries}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const text=`CERTIFICADO DE HABILITAÇÃO TÉCNICA – CHT
II - LICENÇA / LICENSE
Licença | Categoria | Data de Expedição
License | Category | Date of Issue (dd/mm/yyyy)
COMISSÁRIO | Comissário(a) de Vôo | 12/02/2020
FLIGHT ATTENDANT | Flight Attendant
--- PÁGINA 2 ---
XII - HABILITAÇÕES / RATINGS
Tipo | Validade | Função a bordo
Type Rating | Date of Expiry (mm/yyyy) | Onboard Duty
A320 | 08/2031 | Comissário(a) de Vôo / Flight Attendant
XIV - CERTIFICADO MÉDICO AERONÁUTICO / MEDICAL CERTIFICATE
Classe | Validade | Órgão Expedidor | Tipo Sanguíneo
License | Date of Expiry (dd/mm/yyyy) | Issuing Agency | Blood Group
Segunda / | 17/05/2033 | [OMITIDO] | [OMITIDO]
Second
Observações CMS - 2ª CLASSE - COMISSÁRIO DE VOO / CLASS 2 - CABIN CREW.
Remarks POSSUI CMA DE 1ª CLASSE -
PLA VÁLIDO ATÉ 17/05/2030 EMITIDO PELA [ÓRGÃO FICTÍCIO] /
FIRST CLASS VALID UNTIL 05/17/2030.
XIII - OBSERVAÇÕES / REMARKS
ENGLISH LEVEL 4 UNTIL 11/2031
PORTUGUESE LEVEL 6
DATA DE EMISSÃO
DATE OF ISSUE (dd/mm/yyyy)
03/02/2030
X - ASSINATURA DO EMISSOR / SIGNATURE OF AUTHORITY
Emitida eletronicamente em 03/02/2030, às 10:15, conforme horário oficial de Brasília.`;
const compact='CHT\nXII A32008/2031\nXIV CMA Segunda17/05/2033\nCMA1/PLA17/05/2030\nCMA1/ATPL05/17/2030\nXIII ENGLISHLEVEL4UNTIL11/2031\nPortuguese6\nEmissão03/02/2030';assert.equal(parseChtText(compact).entries.filter(e=>e.expiry.kind!=='unknown').length,3,'compact rating code/date is not guessed');assert(parseChtText(compact).conflicts.length,'compact rating remains visibly ambiguous');
assert.equal(parseChtText('CHT\nDATA DE EMISSÃO\nA320 03/02/2030').entries.length,0,'issue context never becomes expiry');assert.equal(parseChtText('CHT\nXII A320 | 08/2031\nDATA DE EMISSÃO\nA320 | 09/2031').entries.length,1,'issue resets expiry section');
assert.equal(parseChtText(text.replace('PLA VÁLIDO ATÉ 17/05/2030','PLA VÁLIDO ATÉ [ilegível]')).entries.find(e=>e.label==='CMA classe 1').expiry.value,'2030-05-17','literal English translation independently read');
assert.equal(parseChtText(text.replace('FIRST CLASS VALID UNTIL 05/17/2030.','')).entries.find(e=>e.label==='CMA classe 1').expiry.value,'2030-05-17','literal PT observation independently read across line break');
const result=parseChtText(text);assert(result.recognized);assert.equal(result.entries.length,4);assert.equal(result.entries.find(e=>e.label==='Inglês nível 4').category,'other');assert.deepEqual(result.conflicts,[]);
assert.deepEqual(result.entries.map(e=>[e.label,e.expiry]).sort(),[['A320',{kind:'month',value:'2031-08'}],['CMA classe 1',{kind:'exact',value:'2030-05-17'}],['CMA classe 2',{kind:'exact',value:'2033-05-17'}],['Inglês nível 4',{kind:'month',value:'2031-11'}]].sort());
assert(result.entries.every(e=>e.confirmed&&e.origin==='pdf_text'&&e.sourceCheck==='pending'&&e.signatureCheck==='unknown'&&e.fitnessCheck==='not_assessed'));
assert.equal(JSON.stringify(parseChtText(text.replaceAll('03/02/2030','20/09/2031'))),JSON.stringify(result),'issuance cannot renew validity or change IDs');
assert.equal(mergeChtEntries(result.entries,parseChtText(text).entries).length,4,'reload/import dedup');
assert.equal(parseChtText('Emissão 03/02/2030').recognized,false);assert.equal(parseChtText('CHT PORTUGUESE LEVEL 6').entries.length,0);
for(const bad of ['31/02/2030','29/02/2031','00/12/2030','17/13/2030']){const p=parseChtText('CHT\nXIV CMA 1 '+bad);assert.equal(p.entries.length,0);assert(p.conflicts.length);}
for(const invalid of ['13/2031','08/20310','08/2031/17'])assert(parseChtText('CHT\nXII A320 '+invalid).entries.every(e=>!e.confirmed),'no partial-date admission');
const damaged=parseChtText('CHT\nXII A320 | 08/2031\nA320 | 13/2031');assert.equal(damaged.entries[0].confirmed,false,'invalid second reading requires review');assert.equal(mergeChtEntries(result.entries,damaged.entries).find(e=>e.label==='A320').confirmed,false,'dedup cannot erase incoming ambiguity');
const conflict=parseChtText(text+'\nXII A320 | 09/2031');assert.equal(conflict.entries.length,5);assert(conflict.entries.filter(e=>e.label==='A320').every(e=>!e.confirmed));assert(conflict.conflicts.includes('A320: validades divergentes'));
const manual={...result.entries.find(e=>e.label==='A320'),id:'manual-history',origin:'manual',revision:7,sourceCheck:'verified'};
const original=JSON.stringify(manual),merged=mergeChtEntries([manual],conflict.entries);assert.equal(JSON.stringify(merged[0]),original,'manual reviewed record preserved');assert(merged.find(e=>e.label==='A320'&&e.expiry.value==='2031-09').confirmed===false);assert(merged.every(e=>!e.supersededBy));
const otherDate=parseChtText('CHT\nXII A320 | 09/2031').entries;const joined=mergeChtEntries(result.entries,otherDate);assert(joined.filter(e=>e.label==='A320').every(e=>!e.confirmed));assert.equal(result.entries.find(e=>e.label==='A320').confirmed,true,'inputs immutable');
assert.equal(parseChtText('CHT\nXIV CMA 1 29/02/2032').entries[0].expiry.value,'2032-02-29');
console.log('PASS CHT pure text: four semantic candidates, bilingual dedup, civil exact/month dates, issue ignored, invalid dates, conflicts, immutable manual/history merge; no identity extraction or verified source/fitness claim.');

for(const code of ['B737','E190','ATR72']){
 const parsed=parseChtText(text.replace('A320 | 08/2031',code+' | 08/2031'));
 assert.equal(parsed.entries.length,4);assert(parsed.entries.some(e=>e.category==='rating'&&e.label===code&&e.expiry.kind==='month'&&e.expiry.value==='2031-08'&&e.confirmed));
}
const multiple=parseChtText(text.replace('A320 | 08/2031','A320 | 08/2031\nB737 | 09/2032\nE190 | 10/2033\nATR72 | 11/2034'));
assert.equal(multiple.entries.filter(e=>e.category==='rating').length,4,'all explicit ratings retained without fleet inference');
const missing=parseChtText('CHT\nXII - HABILITAÇÕES\nB737 | | Comissário');assert.equal(missing.entries[0].expiry.kind,'unknown');assert.equal(missing.entries[0].confirmed,false);assert(missing.conflicts.length);
const ambiguous=parseChtText('CHT\nXII - HABILITAÇÕES\nB73708/2031');assert.equal(ambiguous.entries.length,0);assert(ambiguous.conflicts.length);
console.log('PASS generic XII table tokens B737/E190/ATR72 and multiple ratings; missing/compact ambiguous validity explicitly pending.');

assert.equal(parseChtText('CHT\nXII RATINGS\nB737 08/2031').entries[0].label,'B737','explicit whitespace delimiter supported');
const malformedCode=parseChtText('CHT\nXII RATINGS\nB737000 | 08/2031');assert.equal(malformedCode.entries.length,0);assert(malformedCode.conflicts.length,'invalid table token cannot silently succeed');

const noPipes=text.replaceAll(' | ',' '),noPipeResult=parseChtText(noPipes);
assert.deepEqual(noPipeResult.entries,result.entries,'literal parent with actual PDF whitespace columns yields exactly the same four candidates');
assert.deepEqual(noPipeResult.conflicts,[]);
const plainMultiple=parseChtText(text.replace('A320 | 08/2031 | Comissário(a) de Vôo / Flight Attendant','A320 08/2031 Comissário(a) de Vôo / Flight Attendant\nB737 09/2032 Comissário(a) de Vôo\nE190 10/2033 Flight Attendant\nATR72 11/2034 Cabin Crew').replaceAll(' | ',' '));
assert.equal(plainMultiple.entries.filter(e=>e.category==='rating'&&e.confirmed).length,4,'multiple explicit ratings with trailing duty columns and no pipes');
for(const raw of ['08/2031 09/2032 Comissário','08/2031 Comissário 17/05/2033','08/2031/17 Comissário','08/20310 Comissário']){
 const parsed=parseChtText('CHT\nXII RATINGS\nB737 '+raw);assert(parsed.entries.every(e=>!e.confirmed),'second/partial validity must stay pending');assert(parsed.conflicts.length);
}
console.log('PASS actual PDF whitespace columns: exact four parent candidates, medical row and trailing duty text, multiple ratings; second/partial dates rejected.');

const twoMedicalDates=parseChtText('CHT\nXIV MEDICAL CERTIFICATE\nSegunda / 17/05/2033 18/05/2034');assert(twoMedicalDates.entries.every(e=>!e.confirmed));assert(twoMedicalDates.conflicts.length);

for(const variant of [text.replace('A320 |','A 320 |'),text.replaceAll(' | ',' ').replace('A320 08/2031','A 320 08/2031')]){const p=parseChtText(variant);assert.equal(p.entries.length,4);assert.deepEqual(p.entries.find(e=>e.label==='A320').expiry,{kind:'month',value:'2031-08'});assert.deepEqual(p.conflicts,[]);}
console.log('PASS explicit spaced rating tokens with pipe and whitespace table columns');
