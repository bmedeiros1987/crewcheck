import {loadClientModules} from './ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/financialActApplicability.ts','client/src/lib/sharedAllowanceResolution.ts']});
process.once('exit',()=>modules.cleanup());
/** Real production policy dependencies. Geometry-only tests explicitly opt into
 * invented account manual amounts; these are never ACT/default applicability. */
export function installAllowanceDependencies(context,{manual={},stubConfig=false}={}) {
 Object.assign(context,modules.load('financialActApplicability'),modules.load('sharedAllowanceResolution'));
 context.FinancialActApplicability??=()=>null;
 context.AllowanceMinimumReference??=()=>null;
 if(Object.keys(manual).length){
  const read=context.readOptionalNumberSetting;
  context.readOptionalNumberSetting=key=>read?.(key)??manual[key.replace(/^crewcheck_perdiem_rate_/,'')]??null;
 }
 if(stubConfig){
  const config=context.perDiemConfig;
  context.perDiemConfig=(roster,date)=>{
   const cfg=config(roster,date);
   return {...cfg,resolveSlot:(category,slot)=>{
    const row=cfg.rates[category],value=slot==='taxi'?cfg.taxiRate:slot==='breakfast'?category==='domestic'?cfg.domesticBreakfast:row?.mainMeal*cfg.breakfastPercent:row?.mainMeal;
    return context.resolveSharedAllowanceSlot({category,slot,date,context:context.readFinancialActApplicability(),owned:typeof value==='number'?{value,source:'manual',version:'synthetic-account-fixture',description:'Explicit synthetic manual amount; not an ACT default; previsão não comprova pagamento.'}:null});
   }};
  };
 }
}
