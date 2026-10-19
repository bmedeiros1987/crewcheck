import {createHash} from 'node:crypto';
const TTL=2*60_000, MAX=1000;
const plain=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const civil=epoch=>new Date(epoch-180*60_000).toISOString().slice(0,10);
const revision=snapshot=>createHash('sha256').update(JSON.stringify(snapshot?.roster||null)).digest('hex');
const key=record=>{const {statuses,...display}=record.display||{};return JSON.stringify([record.journeyId||'',Number(record.start),Number(record.end),record.code,record.canonicalEventIds||[],display]);};
const cancelled=record=>record.display?.cancelled===true||['cancelled','canceled','cancelado'].includes(plain(record.day?.status));
// Ephemeral pending offers only. The canonical projection and existing renderers
// remain the producers; no actuation, physical location or actual rest is inferred.
export function createTemporalDialogue(deps,now=deps.now||Date.now){
 const offers=new Map(),turns=new Map();
 const protect=(profile,snapshot)=>{
  const expected=revision(snapshot);
  const validate=async()=>{try{if(!await deps.authorized(profile,snapshot))return false;const current=await deps.snapshot(profile);return await deps.authorized(profile,current)&&revision(current)===expected;}catch{return false;}};
  profile.conciergeResponseAuthority=Object.freeze({kind:'voice',validate});
  return validate;
 };
 const owner=p=>p?.channel==='telegram'&&p.chatType==='private'&&p.linked===true&&p.chatId&&/^[^@\s]+@[^@\s]+$/.test(p.email||'')?`${p.email}|${p.accessKeyHash||''}`:'';
 const prune=()=>{for(const map of [offers,turns]){for(const [chat,item]of map)if(now()-item.at>TTL||now()<item.at)map.delete(chat);while(map.size>=MAX)map.delete(map.keys().next().value);}};
 async function handle(text,profile,snapshot){
  if(!owner(profile)){if(profile?.chatId){offers.delete(String(profile.chatId));turns.delete(String(profile.chatId));}return null;}
  const chat=String(profile.chatId),input=plain(text);prune();
  const turn={at:now()};turns.set(chat,turn);
  const offer=offers.get(chat);offers.delete(chat);
  const yes=/^(sim|quero|quero sim|pode mostrar|detalhes)[.!?]*$/.test(input);
  const schedule=/^\/(?:hoje|proximo)(?:@\S+)?$/.test(input)||/^(?:e )?(?:o que tenho (?:hoje|agora)|qual (?:a )?minha proxima programacao|como esta meu dia|nao fui acionado)[.!?]*$/.test(input);
  const mine=/\bmeu voo\b/.test(input)&&!deps.explicitFlight(text);
  if(!yes&&!schedule&&!mine)return null;
  const denied='A consulta mudou ou expirou. Consulte sua programação novamente.';
  let expected=revision(snapshot),selected=null,selectedEvent=null,deadline=null;
  const validate=async()=>{
   try{
    if(turns.get(chat)!==turn||(deadline!==null&&(now()<deadline||now()-deadline>TTL)))return false;
    if(!await deps.authorized(profile,snapshot))return false;
    const current=await deps.snapshot(profile);
    return await deps.authorized(profile,current)&&revision(current)===expected;
   }catch{return false;}
  };
  profile.conciergeResponseAuthority=Object.freeze({kind:'temporal',validate,acceptWrite:saved=>{
   if(!saved?.roster||!selected)return;
   // Accept only the existing producer's own persisted snapshot, while retaining
   // the selected canonical identity, clocks and cancellation state.
   const current=deps.programs(saved.roster).find(r=>key(r)===key(selected));
   if(current)expected=revision(saved);
  }});
  if(!await validate())return {reply:denied};
  const records=deps.programs(snapshot.roster);
  if(yes){
   if(!offer||offer.owner!==owner(profile)||offer.revision!==expected||now()-offer.at>TTL)return {reply:'Não há um pedido de detalhes válido agora. Consulte sua próxima programação.'};
   deadline=offer.at;
   selected=records.find(r=>key(r)===offer.record);
   if(!selected||cancelled(selected))return {reply:'Essa programação mudou ou consta cancelada. Consulte a escala atual.'};
   const reply=summary(selected);
   return {reply:await validate()?`Detalhes da programação prevista:\n${reply}`:denied};
  }
  if(mine){
   const events=deps.events(snapshot.roster).filter(e=>e.kind==='flight'&&Date.parse(e.endDateTime)>=now());
   const ongoing=events.filter(e=>Date.parse(e.startDateTime)<=now());
   const earliest=events.length?Math.min(...events.map(e=>Date.parse(e.startDateTime))):null;
   const candidates=ongoing.length?ongoing:events.filter(e=>Date.parse(e.startDateTime)===earliest);
   if(candidates.length!==1)return {reply:'Não consegui identificar um único voo pertinente. Informe o número do voo.'};
   const event=candidates[0];selectedEvent=event;selected=records.find(r=>r.canonicalEventIds?.includes(event.id));
   if(!selected)return {reply:'Não consegui confirmar esse voo na leitura atual.'};
   if(cancelled(selected)||['cancelled','canceled','cancelado'].includes(plain(event.leg?.status)))return {reply:'Esse voo consta cancelado na leitura atual. Confirme a situação na fonte operacional.'};
   if(/\b(portao|terminal|radar|status)\b/.test(input)){
    const reply=await deps.radar(`/radar ${event.flightNumber}`,profile,snapshot);
    return {reply:await validate()?reply:denied};
   }
  }else{
   const applicable=records.filter(r=>Number(r.end)>=now());
   const active=applicable.filter(r=>Number(r.start)<=now());
   const first=applicable[0];const candidates=active.length?active:applicable.filter(r=>Number(r.start)===Number(first?.start));
   if(candidates.length!==1)return {reply:candidates.length?'Há mais de uma programação possível. Consulte a escala para escolher.':'Não há próxima programação confirmada nesta leitura. A cobertura dos próximos dias não está confirmada.'};
   selected=candidates[0];
   if(cancelled(selected))return {reply:'A programação pertinente consta cancelada. Confirme a situação na fonte operacional.'};
  }
  const rendered=summary(selected);
  const tomorrow=selected.display?.presentationDate===civil(now()+86_400_000);
  const future=Number(selected.start)>now();
  const endedToday=records.some(r=>Number(r.end)<now()&&civil(Number(r.end))===civil(now()));
  const lead=input.includes('nao fui acionado')?'Você informou que não foi acionado. ':endedToday&&!activeRecord(records,now())?'O período previsto de hoje terminou. Execução e acionamento não estão confirmados. ':'';
  const timing=future?`Próxima programação prevista${tomorrow?' amanhã':''}.`:'Programação prevista em andamento; execução não confirmada.';
  const brief=rendered.split('\n').slice(0,2).join('\n');
  if(!await validate())return {reply:denied};
  deadline=now();
  offers.set(chat,{owner:owner(profile),revision:expected,record:key(selected),at:now()});
  return {reply:`${lead}${selectedEvent ? `Voo pertinente na escala: ${selectedEvent.flightNumber}. ` : ''}${timing}\n${brief}\nQuer os detalhes? Responda “sim”.`};
 }
 const summary=record=>deps.summary(record).replace(/^Próxima programação:/,'Programação prevista:').replace(/^Próxima atividade:/,'Atividade prevista:');
 return {handle,protect,interrupt:chat=>{offers.delete(String(chat));turns.delete(String(chat));}};
}
const activeRecord=(records,now)=>records.some(r=>Number(r.start)<=now&&Number(r.end)>=now);
