import { isValidityDate, type ValidityDate, type ValidityEntry } from './crewlockerValidity';

const normalized = (text:string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const group = (entry:ValidityEntry) => `${entry.category}:${normalized(entry.label).replace(/[^A-Z0-9]+/g,'-')}`;
const semantic = (entry:ValidityEntry) => `${group(entry)}:${entry.expiry.kind}:${'value' in entry.expiry?entry.expiry.value:''}`;
const clone = (entry:ValidityEntry):ValidityEntry => ({...entry,expiry:{...entry.expiry}});
function date(raw:string, english=false):ValidityDate|null {
  const parts=raw.split(/[/.\-]/).map(Number);
  if(parts.length===2){const [month,year]=parts,value={kind:'month' as const,value:`${year}-${String(month).padStart(2,'0')}`};return isValidityDate(value)?value:null;}
  if(parts.length!==3)return null;
  let [day,month,year]=parts;
  // Brazilian CHT is D/M/Y; explicit English translation is M/D/Y.
  // A day > 12 also disambiguates a translated date without guessing a renewal.
  if(english || (month>12&&day<=12)) [day,month]=[month,day];
  const value={kind:'exact' as const,value:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
  return isValidityDate(value)?value:null;
}
/** Textual candidates only: no holder/ID extraction, OCR, fitness or source validation. */
export function parseChtText(text:string):{recognized:boolean;entries:ValidityEntry[];conflicts:string[]} {
  if(typeof text!=='string'||text.length>500000)return {recognized:false,entries:[],conflicts:text?.length>500000?['text-too-large']:[]};
  const input=normalized(text),recognized=/\bCHT\b|CERTIFICADO\s+DE\s+HABILITACAO|\bXII\b[\s\S]{0,80}(?:HABILITACOES|RATINGS)/.test(input);
  if(!recognized)return {recognized:false,entries:[],conflicts:[]};
  const entries:ValidityEntry[]=[],conflicts:string[]=[];
  const sections:Record<string,string>={XII:'',XIII:'',XIV:''};let active='';
  for(const line of input.split(/\r?\n/)){
    const heading=line.match(/^\s*(XIV|XIII|XII|XI|IX|VIII|VII|VI|IV|XV|III|II|V|X|I)\b/);
    if(heading)active=Object.hasOwn(sections,heading[1])?heading[1]:'';
    if(/^\s*(?:DATA DE EMISSAO|DATE OF ISSUE|DATA DE EXPEDICAO)/.test(line))active='';
    if(active)sections[active]+=line+'\n';
  }

  const add=(category:ValidityEntry['category'],label:string,raw:string,english=false)=>{
    const expiry=date(raw,english);
    if(!expiry){conflicts.push(`${label}: data inválida`);return;}
    const entry:ValidityEntry={id:'',revision:1,category,label,expiry,confirmed:true,origin:'pdf_text',sourceCheck:'pending',signatureCheck:'unknown',fitnessCheck:'not_assessed'};
    entry.id='cht:'+semantic(entry).toLowerCase();
    if(!entries.some(item=>semantic(item)===semantic(entry)))entries.push(entry);
  };
  // Explicit labels anchor each date; issue dates and unrelated numbers never qualify.
  const expiryToken='(\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4}|\\d{1,2}[/.\\-]\\d{4})(?!\\d|[/.\\-]\\d)';
  // Read explicit table tokens, not an aircraft catalogue or an inferred fleet.
  // Code/date concatenation is ambiguous: never split the numeric suffix by guessing.
  const codePattern=/^[A-Z]{1,5}-?\d{1,4}[A-Z]{0,3}$/;
  const pendingRating=(label:string,reason:string)=>{
    const entry:ValidityEntry={id:'',revision:1,category:'rating',label,expiry:{kind:'unknown'},confirmed:false,origin:'pdf_text',sourceCheck:'pending',signatureCheck:'unknown',fitnessCheck:'not_assessed'};
    entry.id='cht:'+semantic(entry).toLowerCase();
    if(!entries.some(item=>semantic(item)===semantic(entry)))entries.push(entry);
    conflicts.push(`${label}: ${reason}`);
  };
  for(const rawLine of sections.XII.split(/\r?\n/)){
    const line=rawLine.replace(/^\s*XII\b\s*[-:]?\s*/,'').trim();
    if(!line)continue;
    const cells=line.split('|').map(cell=>cell.trim());
    const plain=cells.length===1?line.match(/^([A-Z]{1,5}-?\d{1,4}[A-Z]{0,3})(?:[ \t]+(.*))?$/):null;
    const code=cells.length>1?cells[0]:plain?.[1];
    if(!code||!codePattern.test(code)){
      if(cells.length>1&&/\d/.test(cells[0])&&/\d/.test(cells[1]||''))conflicts.push('Habilitação: código da tabela exige revisão');
      if(/^[A-Z][A-Z0-9-]*\d[/.]\d/.test(line))conflicts.push('Habilitação: código e validade sem separação inequívoca');
      continue;
    }
    let raw=cells.length>1?cells[1]:plain?.[2]||'';
    if(cells.length===1&&raw){
      const fields=raw.match(/^(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|\d{1,2}[/.\-]\d{4})(?:[ \t]+(.*))?$/);
      if(fields && !/(?:\d[/.\-]\d|\b\d{4}\b)/.test(fields[2]||''))raw=fields[1];
      else {pendingRating(code,'validade ausente ou ambígua');continue;}
    }
    if(!raw){pendingRating(code,'validade ausente');continue;}
    // Whole validity cell only; a partial date or a second unsplit date cannot qualify.
    if(!/^(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|\d{1,2}[/.\-]\d{4})$/.test(raw)){
      pendingRating(code,'validade ausente ou ambígua');continue;
    }
    if(!date(raw)){pendingRating(code,'data inválida');continue;}
    add('rating',code,raw);
  }
  const medical=new RegExp('(?:\\bCMA\\s*(?:DE\\s*)?(SEGUNDA|SECOND|2|PRIMEIRA|FIRST|1)(?:[ªA]?\\s*CLASSE)?|\\b(?:MEDICAL(?:\\s+CERTIFICATE)?\\s+CLASS|CLASS)\\s*(1|2)(?:\\s+MEDICAL)?)\\s*(?:[\\s/:,;|()-]|PLA|ATPL|ATE|UNTIL|VALIDADE|VALIDO|VALID|CLASS|CLASSE)*\\s*'+expiryToken,'g');
  for(const match of sections.XIV.matchAll(medical)){
    const cls=/^(SEGUNDA|SECOND|2)$/.test(match[1]||match[2])?'2':'1';
    add('medical',`CMA classe ${cls}`,match[3],Boolean(match[2]));
  }
  for(const match of sections.XIV.matchAll(new RegExp('\\b(SEGUNDA|SECOND|PRIMEIRA|FIRST)(?:\\s*/\\s*(?:\\|\\s*)?|\\s*\\|\\s*|[ \t]+)'+expiryToken,'g'))){
    const label=/^(SEGUNDA|SECOND)$/.test(match[1])?'CMA classe 2':'CMA classe 1';
    const trailing=sections.XIV.slice(match.index!+match[0].length).split(/\r?\n/,1)[0];
    if(/(?:\d[/.\-]\d|\b\d{4}\b)/.test(trailing)){conflicts.push(`${label}: data inválida`);continue;}
    add('medical',label,match[2],match[1]==='SECOND'||match[1]==='FIRST');
  }
  for(const match of sections.XIV.matchAll(new RegExp('\\b(FIRST|SECOND)\\s*CLASS\\s*VALID\\s*UNTIL\\s*'+expiryToken,'g')))add('medical',match[1]==='FIRST'?'CMA classe 1':'CMA classe 2',match[2],true);
  for(const match of sections.XIII.matchAll(new RegExp('\\bENGLISH\\s*(?:LEVEL|NIVEL)\\s*([1-6])\\s*(?:VALID\\s*)?(?:UNTIL|ATE|VALIDADE)\\s*'+expiryToken,'g')))add('other',`Inglês nível ${match[1]}`,match[2],match[2].split(/[/.\-]/).length===3);
  for(const entry of entries){if(conflicts.includes(`${entry.label}: data inválida`))entry.confirmed=false;if(entries.some(other=>group(other)===group(entry)&&semantic(other)!==semantic(entry))){entry.confirmed=false;conflicts.push(`${entry.label}: validades divergentes`);}}
  return {recognized:true,entries:entries.sort((a,b)=>a.id.localeCompare(b.id)),conflicts:[...new Set(conflicts)].sort()};
}
/** Preserve reviewed/manual records and history. A new date never supersedes an old one. */
export function mergeChtEntries(existing:readonly ValidityEntry[],incoming:readonly ValidityEntry[]):ValidityEntry[] {
  const result=existing.map(clone);
  for(const candidate of incoming){
    const duplicate=result.find(entry=>semantic(entry)===semantic(candidate));
    if(duplicate){if(!duplicate.supersededBy&&duplicate.origin==='pdf_text'&&!candidate.confirmed)duplicate.confirmed=false;continue;}
    const next=clone(candidate);
    if(result.some(entry=>!entry.supersededBy&&group(entry)===group(next)&&semantic(entry)!==semantic(next))){
      next.confirmed=false;
      for(const entry of result)if(!entry.supersededBy&&entry.origin==='pdf_text'&&group(entry)===group(next))entry.confirmed=false;
    }
    // IDs are semantic; do not overwrite an unrelated/manual ID collision.
    if(result.some(entry=>entry.id===next.id))continue;
    result.push(next);
  }
  return result;
}
