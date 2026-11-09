import assert from 'node:assert/strict';
import { build } from 'esbuild';
const {outputFiles}=await build({entryPoints:['client/src/lib/crewlockerDocumentType.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {crewDocumentType}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
for(const [text,type] of [['CERTIFICADO DE HABILITAÇÃO TÉCNICA – CHT\nXIV - CERTIFICADO MÉDICO AERONÁUTICO / MEDICAL CERTIFICATE','CHT'],['CARTEIRA NACIONAL DE HABILITAÇÃO','CNH'],['CARTEIRA DE IDENTIDADE NACIONAL','RG'],['PASSAPORTE / PASSPORT','Passaporte'],['CERTIFICADO MÉDICO AERONÁUTICO','CMA']])assert.deepEqual(crewDocumentType(text),{type,ambiguous:false});
for(const text of ['copia-CHT.pdf','Tenho CHT e passaporte','CHT A320 08/2031','HABILITAÇÃO','RG','CNH','XIV - CERTIFICADO MÉDICO AERONÁUTICO / MEDICAL CERTIFICATE','x'.repeat(500001)])assert.deepEqual(crewDocumentType(text),{type:null,ambiguous:false});
assert.deepEqual(crewDocumentType('PASSAPORTE\nCARTEIRA NACIONAL DE HABILITAÇÃO'),{type:null,ambiguous:true});
assert.deepEqual(crewDocumentType('PASSAPORTE\fPASSPORT'),{type:'Passaporte',ambiguous:false});
console.log('PASS local document header classification: CHT/CMA/RG/CNH/passport; nested sections, filename/prose/acronym and mixed documents fail closed; no personal fields extracted');
