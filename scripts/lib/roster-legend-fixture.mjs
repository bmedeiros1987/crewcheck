import path from 'node:path';
import { build } from 'esbuild';
export async function buildRosterLegendFixture(outfile) {
 await build({entryPoints:['scripts/fixtures/roster-legend-app.tsx'],bundle:true,jsx:'automatic',format:'iife',outfile,logLevel:'silent',plugins:[{name:'roster-offline-boundaries',setup(b){
  b.onResolve({filter:/NextFlightGateCard$/},()=>({path:'next',namespace:'synthetic'}));
  b.onResolve({filter:/\/v139\/Shell$/},()=>({path:'shell',namespace:'synthetic'}));
  b.onResolve({filter:/AlertRosterNavigation$/},()=>({path:'alerts',namespace:'synthetic'}));
  b.onResolve({filter:/StayOperationalDetails$/},()=>({path:'stay',namespace:'synthetic'}));
  b.onResolve({filter:/\/finance\/FinancialPrivacy$/},()=>({path:'privacy',namespace:'synthetic'}));
  b.onLoad({filter:/.*/,namespace:'synthetic'},args=>({contents:args.path==='next'?'export const NextFlightGateCard=({events})=>{window.__nextFlightInput=events;return null;}':args.path==='shell'?'export const V139Header=()=>null;':args.path==='alerts'?'export const AlertRosterNavigation=()=>null;':args.path==='stay'?'export const StayOperationalDetails=({events})=>{window.__stayOperationalInput=events;return null;}':'export const useFinancialPrivacy=()=>({text:value=>value});export const FinancialPrivacyToggle=()=>null;'}));
 }}]});
}
