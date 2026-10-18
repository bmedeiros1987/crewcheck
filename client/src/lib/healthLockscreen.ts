export const HEALTH_CARD_FIELDS = [
 ['displayName','Nome'],['crewId','ID CrewCheck'],['bloodType','Tipo sanguíneo'],['allergies','Alergias'],['medications','Medicamentos'],['conditions','Condições/cuidados'],['criticalNotes','Observação crítica'],['contactName','Contato de emergência'],['contactPhone','Telefone de emergência'],
] as const;
export type HealthCardField = typeof HEALTH_CARD_FIELDS[number][0];
export type HealthCardValues = Partial<Record<HealthCardField,string>>;
const escapeXml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function healthLockscreenSvg(values:HealthCardValues, selected:HealthCardField[]) {
 const rows:{text:string;heading:boolean}[]=[];
 for(const [key,label] of HEALTH_CARD_FIELDS){
  if(!selected.includes(key))continue;
  const value=String(values[key]||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();if(!value)continue;
  rows.push({text:label,heading:true});
  const words=value.split(/\s+/);let line='';
  for(const word of words){for(let offset=0;offset<word.length;offset+=38){const chunk=word.slice(offset,offset+38);if(line&&line.length+chunk.length+1>38){rows.push({text:line,heading:false});line='';}line+=(line?' ':'')+chunk;}}
  if(line)rows.push({text:line,heading:false});
 }
 if(!rows.length)throw Error('Escolha pelo menos um campo preenchido para a prévia.');
 if(rows.length>22)throw Error('Texto longo demais para a imagem. Reduza os campos ou o texto; nenhum dado será cortado.');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#071322"/><text x="80" y="400" font-family="sans-serif" font-size="52" fill="#fff">Saúde · CrewCheck</text>${rows.map((r,i)=>`<text x="80" y="${490+i*52}" font-family="sans-serif" font-size="${r.heading?28:36}" fill="${r.heading?'#a5f3fc':'#fff'}">${escapeXml(r.text)}</text>`).join('')}<text x="80" y="1780" font-family="sans-serif" font-size="25" fill="#cbd5e1">Informações fornecidas pelo titular.</text><text x="80" y="1825" font-family="sans-serif" font-size="25" fill="#cbd5e1">Não substitui avaliação médica. Imagem sem QR.</text></svg>`;
}
