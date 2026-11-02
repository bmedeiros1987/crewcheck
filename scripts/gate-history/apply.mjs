import fs from 'node:fs';
const path='client/src/pages/Home.tsx';let source=fs.readFileSync(path,'utf8');
const importLine="import { GateHistoryPanel } from '@/components/nextflight/GateHistoryPanel';";
const anchor="import { ManualGateEditor } from '@/components/nextflight/ManualGateEditor';";
const before='<ManualGateEditor event={event}/></>;',after='<ManualGateEditor event={event}/><GateHistoryPanel event={event}/></>;';
if(!source.includes('function RadarView('))throw Error('Radar history target missing');
if(source.includes(importLine)!==source.includes(after))throw Error('Partial Radar history preparation');
if(!source.includes(importLine)){
 if(source.split(anchor).length!==2||source.split(before).length!==2)throw Error('Radar history target ambiguous');
 source=source.replace(anchor,anchor+'\n'+importLine).replace(before,after);fs.writeFileSync(path,source);
}
