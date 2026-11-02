import fs from 'node:fs';
const path='client/src/pages/Home.tsx';let source=fs.readFileSync(path,'utf8');
const importLine="import { GateHistoryPanel } from '@/components/nextflight/GateHistoryPanel';";
const importAnchor="import { ManualGateEditor } from '@/components/nextflight/ManualGateEditor';";
const start=source.indexOf('function RadarView('),end=source.indexOf('\nfunction ',start+1);
if(start<0||end<0||source.split('function RadarView(').length!==2)throw Error('Radar history target ambiguous');
let block=source.slice(start,end);
// Repair this feature's earlier footer placement without touching the existing
// FollowFlight finalizer contract. Canonical placement precedes the action group.
block=block.replace('<ManualGateEditor event={event}/><GateHistoryPanel event={event}/></>;','<ManualGateEditor event={event}/></>;');
const before='<section className="cz-toolbox"><h2>Ações</h2>',after='<GateHistoryPanel event={event}/>'+before;
if(block.split('<GateHistoryPanel event={event}/>').length>2)throw Error('Duplicate Radar history panel');
if(!block.includes(after)){
 if(block.includes('<GateHistoryPanel ')||block.split(before).length!==2)throw Error('Radar history action target missing');
 block=block.replace(before,after);
}
source=source.slice(0,start)+block+source.slice(end);
if(!source.includes(importLine)){
 if(source.split(importAnchor).length!==2)throw Error('Radar history import target ambiguous');
 source=source.replace(importAnchor,importAnchor+'\n'+importLine);
}
if(source!==fs.readFileSync(path,'utf8'))fs.writeFileSync(path,source);
