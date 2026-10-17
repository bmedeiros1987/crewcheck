import {readFinancialSetting} from './financialSettingStore';
import {validFxQuote,sameFxRate} from '@shared/financialFx.mjs';
export type FxQuote={rate:string;asOf:string;source:string;base?:string;quote?:string;method?:string;retrievedAt?:string;contributors?:Array<{key:string;asOf:string}>};
export function readFinancialFxReferences(today=new Date().toISOString().slice(0,10)):Record<string,FxQuote>{
  const quotes:Record<string,FxQuote>={};
  for(const currency of ['USD','EUR','GBP']){
    const key='crewcheck_fx_'+currency.toLowerCase()+'_brl';
    try{const raw=readFinancialSetting(key),meta=JSON.parse(readFinancialSetting(key+'_reference','null'));if(meta&&sameFxRate(meta.rate,raw)&&validFxQuote(meta,today))quotes[currency]={base:currency,quote:'BRL',method:'account_manual',rate:meta.rate,asOf:meta.asOf,source:meta.source};}catch{}
  }
  return quotes;
}
