import fs from 'node:fs';
// Generated Home must be patched after the fixed-header and catalogue composition.
const path='client/src/pages/Home.tsx';
let home=fs.readFileSync(path,'utf8');
const marker='// standby-sequence-card-v1';
if(!home.includes(marker)) {
 const next='? <FlightCard event={event}/>';
 const timeline='    <OperationalDayTimeline events={events} onNavigate={(target) => setView(target as ZeroView)}/>';
 if(!home.includes(next)||!home.includes(timeline)) throw new Error('Published sequence Home anchors missing');
 home=home.replace(next,'? <><FlightCard event={event}/><PublishedSequenceCard events={events.flatMap(item => item.canonical ? [item.canonical] : [])} anchorId={event.canonical?.id || event.id}/></>');
 home=home.replace(timeline,'    <PublishedSequenceCard events={events.flatMap(item => item.canonical ? [item.canonical] : [])} anchorId={event.canonical?.id || event.id}/>\n\n'+timeline);
 home=home.replace('<span>Apresentação<strong>{flyDeckClockV14353(event.presentation)}','<span>{isHomeStandby(event) ? \'Início do sobreaviso\' : \'Apresentação\'}<strong>{flyDeckClockV14353(event.presentation)}');
 home=home.replace('<div><span>Apresentação</span><strong>{event.presentation}</strong>','<div><span>{isHomeStandby(event) ? \'Início do sobreaviso\' : \'Apresentação\'}</span><strong>{event.presentation}</strong>');
 fs.writeFileSync(path,marker+"\nimport { PublishedSequenceCard } from '@/components/PublishedSequenceCard';\n"+home);
}
// The executable projector is the single source for production and synthetic tests.
const source=fs.readFileSync('scripts/standby-sequence-card/evidence.mjs','utf8');
fs.writeFileSync('client/src/lib/publishedSequence.ts', '// Generated from scripts/standby-sequence-card/evidence.mjs\n'+source.replace('const gaps = [...boundaryGaps], evidence = [], next = available[1];', 'const gaps: string[] = [...boundaryGaps], evidence: {kind: string; successorId?: string; text: string; beforeEnd?: string; afterEnd?: string}[] = [], next = available[1];').replace('const boundaryGaps = [];', 'const boundaryGaps: string[] = [];').replace('const root = sorted[from], available = [];','const root = sorted[from], available: any[] = [];').replace('export function sequenceEvidence({ owner, revision, events, anchorId, previous, confirmation })','export function sequenceEvidence({ owner, revision, events, anchorId, previous, confirmation }: { owner: string | null; revision: string; events: any[]; anchorId: string; previous?: any; confirmation?: any })'));
