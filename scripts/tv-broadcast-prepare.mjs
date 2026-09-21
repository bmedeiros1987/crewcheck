import {readFile,writeFile} from 'node:fs/promises';
// Explicit opt-in preview composition. No parser, auth, runtime provider or
// production web code is changed. Abort on changed anchors instead of guessing.
const root='apps/tv-player/src/';
const read=name=>readFile(root+name,'utf8');
const save=(name,text)=>writeFile(root+name,text);
function replace(text,old,next){if(!text.includes(old))throw Error('Broadcast preparation anchor changed: '+old.slice(0,90));return text.replace(old,next);}
let main=await read('main.tsx');
if(!main.includes("from './BroadcastPanels'")){
 main=replace(main,"import { useTvChannel, ChannelDock, ChannelSettings } from './TvChannel';","import { useTvChannel, ChannelDock, ChannelSettings } from './TvChannel';\nimport { BroadcastPanel, OfficialTvBrand, ProviderCredit, CreatorCredit } from './BroadcastPanels';\nimport { quickAvailability } from './broadcastPolicy';");
 main=replace(main,"type View = 'Agora' |","type View = 'Meteorologia' | 'Radar' | 'Apresentação' | 'Pernoite' | 'Agora' |");
 main=replace(main,"const views: View[] = ['Agora', 'Semana', 'Mês', 'Mudanças', 'Notícias', 'Configurações'];","const views: View[] = ['Agora', 'Mês', 'Meteorologia', 'Radar', 'Apresentação', 'Pernoite', 'Configurações'];");
 main=replace(main,'hasNews:news.length>0, covered:','hasNews:news.length>0, quick:quickAvailability(snapshot,clock.getTime(),displayPrefs.value), covered:');
 main=replace(main,"className={'tv-app theme-' + theme}","className={'tv-app tv-broadcast theme-' + theme}");
 main=replace(main,'<header><TvBrand/>','<header><OfficialTvBrand/>');
 main=main.replace('Prévia visual 0.1.6','Prévia visual 0.1.7');
 main=replace(main,'<span>{v}</span>',"<span>{v==='Mês'?'Escala':v==='Meteorologia'?'Clima':v}</span>");
 const a=main.indexOf("      {view === 'Agora' && <section"),b=main.indexOf("      {(view === 'Mês'",a);
 if(a<0||b<a)throw Error('Broadcast view boundaries changed');
 main=main.slice(0,a)+"      {(['Agora','Meteorologia','Radar','Apresentação','Pernoite'] as string[]).includes(view) && <BroadcastPanel view={view as any} snapshot={snapshot} demo={demo} clock={clock} openDay={date=>openDay(date,view)} openView={setView} prefs={displayPrefs.value}/> }\n"+main.slice(b);
 main=replace(main,'<div className="calendar-actions">','<div className="calendar-actions"><button onClick={()=>setView(view===\'Mês\'?\'Semana\':\'Mês\')}>{view===\'Mês\'?\'Ver semana\':\'Ver mês\'}</button>');
 main=replace(main,'<p className="note">Selecione um dia com OK. Dias sem programação não significam folga confirmada.</p>','<div className="note"><span>OK abre o dia. Sem programação não significa folga confirmada.</span><ProviderCredit provider="crewtopia" demo={demo}/></div>');
 main=replace(main,'<ChannelDock channel={channel}/></footer>','<ChannelDock channel={channel}/><CreatorCredit/></footer>');
 await save('main.tsx',main);
}
let visuals=await read('TvVisuals.tsx');
if(!visuals.includes("name === 'Radar'")){
 visuals=replace(visuals,'import { CloudSun, Wind, Radio,','import { Radar, CloudSun, Wind, Radio,');
 visuals=replace(visuals,"const Icon = name === 'Agora'","const Icon = name === 'Radar' ? Radar : name === 'Meteorologia' ? CloudSun : name === 'Apresentação' ? Car : name === 'Pernoite' ? BedDouble : name === 'Agora'");
 await save('TvVisuals.tsx',visuals);
}
let policy=await read('channelPolicy.ts');
if(!policy.includes('quick?:')){
 policy=replace(policy,'export type ChannelView =',"export type ChannelView = 'Meteorologia' | 'Radar' | 'Apresentação' | 'Pernoite' |");
 policy=replace(policy,'hasNews: boolean): ChannelView[] {',"hasNews: boolean, quick?: {presentation:boolean;weather:boolean;radar:boolean;stay:boolean}): ChannelView[] {\n  if (quick) return hasSnapshot ? ['Agora', 'Mês', ...(quick.presentation ? ['Apresentação' as const] : []), ...(quick.weather ? ['Meteorologia' as const] : []), ...(quick.radar ? ['Radar' as const] : []), ...(quick.stay ? ['Pernoite' as const] : []), ...(hasChanges ? ['Mudanças' as const] : []), ...(hasNews ? ['Notícias' as const] : [])] : [];");
 await save('channelPolicy.ts',policy);
}
let channel=await read('TvChannel.tsx');
if(!channel.includes('quick?:')){
 channel=replace(channel,'hasNews:boolean;covered:','hasNews:boolean;quick?:{presentation:boolean;weather:boolean;radar:boolean;stay:boolean};covered:');
 channel=replace(channel,'channelDeck(c.hasSnapshot,c.hasChanges,c.hasNews)','channelDeck(c.hasSnapshot,c.hasChanges,c.hasNews,c.quick)');
 channel=channel.replaceAll('channelDeck(options.hasSnapshot,options.hasChanges,options.hasNews)','channelDeck(options.hasSnapshot,options.hasChanges,options.hasNews,options.quick)');
 channel=replace(channel,'Ativar ou desativar troca automática de telas','Pausar ou retomar telas automáticas');
 channel=replace(channel,"channel.enabled?(channel.reading?'Auto · pausa':'Auto · '+channel.countdown+'s'):'Telas manuais'","channel.enabled?(channel.reading?'Pausar tela · leitura':'Pausar tela · '+channel.countdown+'s'):'Retomar telas'");
 channel=replace(channel,'Agora → Semana → Mês. Mudanças e Notícias entram quando houver conteúdo.','Agora, Escala e consultas rápidas. Telas sem dados não entram na rotação; continuam disponíveis no menu.');
 await save('TvChannel.tsx',channel);
}
console.log('Broadcast preview composition prepared. Source assets are still required before final IPK.');
