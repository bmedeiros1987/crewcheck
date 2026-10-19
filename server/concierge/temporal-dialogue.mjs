import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
const TTL=2*60_000,ORDER_TTL=7*24*60*60_000,MAX=1000;
const plain=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const no=v=>/^(nao|agora nao|cancelar|cancela)[.!?]*$/.test(plain(v));
const yes=v=>/^(sim|quero|quero sim|pode mostrar|detalhes)[.!?]*$/.test(plain(v));
const revision=s=>createHash('sha256').update(JSON.stringify(s?.roster||null)).digest('hex');
const civil=t=>new Date(t-180*60_000).toISOString().slice(0,10);
const key=r=>{const{statuses,...display}=r.display||{};return JSON.stringify([r.journeyId||'',Number(r.start),Number(r.end),r.code,r.canonicalEventIds||[],display]);};
const cancelled=r=>r.display?.cancelled===true||['cancelled','canceled','cancelado'].includes(plain(r.day?.status));
const identity=p=>p?.linked===true&&p.channel==='telegram'&&p.chatType==='private'&&p.chatId&&/^[^@\s]+@[^@\s]+$/.test(p.email||'')?`${String(p.email).trim().toLowerCase()}|${p.accessKeyHash||''}`:'';
const freezePrincipal=p=>Object.freeze({email:p.email,name:p.name,chatId:String(p.chatId),linked:p.linked,channel:p.channel,chatType:p.chatType,accessKeyHash:String(p.accessKeyHash||''),authenticated:p.authenticated===true});
export function createTemporalDialogue(deps,now=deps.now||Date.now){
 const offers=new Map(),turns=new Map(),order=new Map(),states=new WeakMap(),declines=new WeakSet(),observed=new WeakMap(),consumed=new WeakSet(),storage=new AsyncLocalStorage();
 const prune=()=>{for(const map of[offers,turns]){for(const[chat,item]of map)if(now()<item.at||now()-item.at>TTL)map.delete(chat);while(map.size>=MAX)map.delete(map.keys().next().value);}};
 const currentTurn=ctx=>Boolean(ctx&&turns.get(ctx.chat)===ctx.turn&&now()>=ctx.turn.at&&now()-ctx.turn.at<=TTL);
 const sameBinding=ctx=>{const p=deps.profileNow(ctx.principal);return identity(p)===ctx.owner&&String(p?.chatId)===ctx.chat;};
 const owned=(p,s)=>Boolean(s?.roster&&plain(s.email||s.key)===plain(p.email)&&(!s.key||plain(s.key)===plain(p.email))&&deps.access(p,s));
 const rootCheck=ctx=>{try{const latest=deps.snapshotNow(ctx.principal);return currentTurn(ctx)&&sameBinding(ctx)&&revision(latest)===ctx.revision&&(!latest?.roster||owned(ctx.principal,latest));}catch{return false;}};
 // Telegram update_id orders events; callback.message_id identifies the old
 // bot message bearing a button and is never a turn-order key. Telegram may
 // randomize update IDs after a week without updates; forget only idle ranks.
 function advance(chat,update,strict){
  const id=update?.update_id;
  if(typeof id!=='number'||!Number.isSafeInteger(id)||id<=0)return !strict;
  const previous=order.get(chat),at=now();
  if(previous&&(at<previous.at||at-previous.at<ORDER_TTL)&&id<=previous.id)return false;
  if(!order.has(chat))while(order.size>=MAX){const oldest=order.keys().next().value;order.delete(oldest);turns.delete(oldest);offers.delete(oldest);}
  order.delete(chat);order.set(chat,Object.freeze({id,at}));return true;
 }
 function observe(update,strict=false){
  if(observed.has(update))return observed.get(update);
  const query=update?.callback_query,message=query?.message||update?.message||update?.edited_message,from=query?.from||message?.from;
  if(message?.chat?.type!=='private'||!from?.id||String(from.id)!==String(message.chat.id))return null;
  const chat=String(message.chat.id);
  if(!advance(chat,update,strict)){const rejected=Object.freeze({stale:true});observed.set(update,rejected);return rejected;}
  prune();const declined=Boolean(offers.has(chat)&&no(message.text)),turn=Object.freeze({at:now()});turns.set(chat,turn);
  const voice=Boolean(message.voice||message.audio||message.document?.mime_type?.startsWith('audio/'));
  if(query||(!voice&&!yes(message.text||'')))offers.delete(chat);
  const cached=deps.profileNow({chatId:chat}),owner=identity(cached),snapshot=owner?deps.snapshotNow(cached):null;
  const proof=Object.freeze({chat,turn,declined,message,from,beforeOwner:owner,revision:owned(cached,snapshot)?revision(snapshot):null});observed.set(update,proof);return proof;
 }
 async function run(update,work){
  const proof=observe(update);if(!proof)return work();if(proof.stale)return true;if(consumed.has(update))return true;consumed.add(update);
  const{chat,turn,declined,message,from,beforeOwner}=proof;
  const loaded=await deps.profile({chat:message.chat,from});
  if(turns.get(chat)!==turn)return true;
  if(beforeOwner&&beforeOwner!==identity(loaded))return true;
  const principal=freezePrincipal(loaded||{chatId:chat});
  const snapshot=identity(principal)?await deps.snapshot(principal):null;
  if(turns.get(chat)!==turn)return true;
  const entryRevision=proof.revision===null?revision(snapshot):proof.revision;
  if(snapshot?.roster&&!await deps.authorized(principal,snapshot))return true;
  const ctx=Object.freeze({chat,turn,principal,owner:identity(principal),snapshot,revision:entryRevision});
  if(ctx.owner&&!rootCheck(ctx))return true;
  if(declined)declines.add(ctx);
  return storage.run(ctx,work);
 }
 function state(profile,snapshot){
  const ctx=storage.getStore();if(!ctx||ctx.chat!==String(profile.chatId)||!ctx.owner||identity(profile)!==ctx.owner)return null;
  let s=states.get(ctx);if(s){profile.conciergeResponseAuthority=s.authority;return s;}
  const expected=ctx.revision;let acceptedRadar=null,deadline=null;
  const checkNow=()=>{try{const latest=deps.snapshotNow(ctx.principal);return currentTurn(ctx)&&sameBinding(ctx)&&owned(ctx.principal,latest)&&revision(latest)===expected&&(deadline===null||(now()>=deadline&&now()-deadline<=TTL))&&(!acceptedRadar||deps.radarCurrent(acceptedRadar.payload,acceptedRadar.evidence,latest.roster));}catch{return false;}};
  const validate=async()=>{try{if(revision(snapshot)!==ctx.revision||!checkNow()||!await deps.authorized(ctx.principal,ctx.snapshot))return false;const latest=await deps.snapshot(ctx.principal);if(revision(latest)!==expected||!await deps.authorized(ctx.principal,latest))return false;return checkNow();}catch{return false;}};
  const authority=Object.freeze({kind:'temporal',validate,checkNow,
   acceptRadar:(payload,evidence)=>{if(payload?.ok&&!payload.querySuppressed)acceptedRadar=Object.freeze({payload:Object.freeze({...payload}),evidence:Object.freeze({...evidence})});},
  });
  s={authority,setDeadline:value=>{deadline=value;},ctx};states.set(ctx,s);profile.conciergeResponseAuthority=authority;return s;
 }
 function protect(profile,snapshot){const s=state(profile,snapshot);if(!s)profile.conciergeResponseAuthority=Object.freeze({kind:'temporal',validate:async()=>false,checkNow:()=>false});return profile.conciergeResponseAuthority.validate;}
 const summary=r=>deps.summary(r).replace(/^Próxima programação:/,'Programação prevista:').replace(/^Próxima atividade:/,'Atividade prevista:');
 async function handle(text,profile,snapshot){
  const ctx=storage.getStore();if(!identity(profile))return null;
  if(!ctx?.owner||identity(profile)!==ctx.owner){protect(profile,snapshot);return{reply:'A consulta mudou ou expirou. Consulte sua programação novamente.'};}
  const chat=String(profile.chatId),input=plain(text),offer=offers.get(chat);offers.delete(chat);
  const decline=(Boolean(offer)||declines.has(ctx))&&no(input);declines.delete(ctx);
  const schedule=/^\/(?:hoje|proximo)(?:@\S+)?$/.test(input)||/^(?:e )?(?:o que tenho (?:hoje|agora)|qual (?:a )?minha proxima programacao|como esta meu dia|nao fui acionado)[.!?]*$/.test(input);
  const mine=/\bmeu voo\b/.test(input)&&!deps.explicitFlight(text);
  if(!yes(input)&&!schedule&&!mine&&!decline)return null;
  const denied='A consulta mudou ou expirou. Consulte sua programação novamente.',s=state(profile,snapshot);
  if(!s||!await s.authority.validate())return{reply:denied};
  if(decline)return{reply:'Tudo bem. Consulta de detalhes cancelada.'};
  const records=deps.programs(snapshot.roster);let selected=null,selectedEvent=null;
  if(yes(input)){
   if(!offer||offer.owner!==ctx.owner||offer.revision!==s.ctx.revision||now()<offer.at||now()-offer.at>TTL)return{reply:'Não há um pedido de detalhes válido agora. Consulte sua próxima programação.'};
   s.setDeadline(offer.at);selected=records.find(r=>key(r)===offer.record);
   if(!selected||cancelled(selected))return{reply:'Essa programação mudou ou consta cancelada. Consulte a escala atual.'};
   return{reply:await s.authority.validate()?`Detalhes da programação prevista:\n${summary(selected)}`:denied};
  }
  if(mine){
   const events=deps.events(snapshot.roster).filter(e=>e.kind==='flight'&&Date.parse(e.endDateTime)>=now()),ongoing=events.filter(e=>Date.parse(e.startDateTime)<=now());
   const earliest=events.length?Math.min(...events.map(e=>Date.parse(e.startDateTime))):null,candidates=ongoing.length?ongoing:events.filter(e=>Date.parse(e.startDateTime)===earliest);
   if(candidates.length!==1)return{reply:'Não consegui identificar um único voo pertinente. Informe o número do voo.'};
   const event=candidates[0];selectedEvent=event;selected=records.find(r=>r.canonicalEventIds?.includes(event.id));
   if(!selected)return{reply:'Não consegui confirmar esse voo na leitura atual.'};
   if(cancelled(selected)||['cancelled','canceled','cancelado'].includes(plain(event.leg?.status)))return{reply:'Esse voo consta cancelado na leitura atual. Confirme a situação na fonte operacional.'};
   if(/\b(portao|terminal|radar|status|cancelado|cancelamento)\b/.test(input)){const reply=await deps.radar(`/radar ${event.flightNumber}`,profile,snapshot);return{reply:await s.authority.validate()?reply:denied};}
  }else{
   const applicable=records.filter(r=>Number(r.end)>=now()),active=applicable.filter(r=>Number(r.start)<=now()),first=applicable[0],candidates=active.length?active:applicable.filter(r=>Number(r.start)===Number(first?.start));
   if(candidates.length!==1)return{reply:candidates.length?'Há mais de uma programação possível. Consulte a escala para escolher.':'Não há próxima programação confirmada nesta leitura. A cobertura dos próximos dias não está confirmada.'};
   selected=candidates[0];if(cancelled(selected))return{reply:'A programação pertinente consta cancelada. Confirme a situação na fonte operacional.'};
  }
  const tomorrow=selected.display?.presentationDate===civil(now()+86_400_000),future=Number(selected.start)>now(),active=records.some(r=>Number(r.start)<=now()&&Number(r.end)>=now()),ended=records.some(r=>Number(r.end)<now()&&civil(Number(r.end))===civil(now()));
  const lead=input.includes('nao fui acionado')?'Você informou que não foi acionado. ':ended&&!active?'O período previsto de hoje terminou. Execução e acionamento não estão confirmados. ':'';
  const timing=future?`Próxima programação prevista${tomorrow?' amanhã':''}.`:'Programação prevista em andamento; execução não confirmada.';
  if(!await s.authority.validate())return{reply:denied};s.setDeadline(now());offers.set(chat,{owner:ctx.owner,revision:s.ctx.revision,record:key(selected),at:now()});
  return{reply:`${lead}${selectedEvent?`Voo pertinente na escala: ${selectedEvent.flightNumber}. `:''}${timing}\n${summary(selected).split('\n').slice(0,2).join('\n')}\nQuer os detalhes? Responda “sim”.`};
 }
 return{observe,run,handle,protect,
  subject:text=>{const ctx=storage.getStore();if(!currentTurn(ctx))return false;if(no(text)&&offers.has(ctx.chat))declines.add(ctx);if(!yes(text))offers.delete(ctx.chat);return true;},
  abandon:()=>{const ctx=storage.getStore();if(currentTurn(ctx))offers.delete(ctx.chat);},
  isCurrent:()=>currentTurn(storage.getStore()),
  currentTurnCheck:()=>{const ctx=storage.getStore();return ctx?()=>currentTurn(ctx)&&Boolean(ctx.owner)&&sameBinding(ctx):null;},
  currentDeliveryCheck:()=>{const ctx=storage.getStore();return ctx?(states.get(ctx)?.authority.checkNow||(()=>currentTurn(ctx)&&(!ctx.owner||sameBinding(ctx)))):null;},
  currentValidator:()=>{const ctx=storage.getStore();return ctx?(states.get(ctx)?.authority.validate|| (async()=>rootCheck(ctx))):null;},
  interrupt:chat=>{offers.delete(String(chat));turns.delete(String(chat));},
 };
}
