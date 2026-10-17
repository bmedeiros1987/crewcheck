import {currencyMinorDigits,decimalToMinor} from './financialMoney.mjs';
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function parseFinancialDecimal(text) {
  if(typeof text!=='string'||text.length>40||!/^[-+]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text.trim()))return null;
  return text.trim().replace(/^\+/,'').replace(/\./g,'').replace(',','.');
}
function ratio(rate){if(typeof rate!=='string'||rate.length>32||!/^\d+(?:\.\d{1,12})?$/.test(rate))return null;const [whole,fraction='']=rate.split('.'),n=BigInt(whole+fraction),d=10n**BigInt(fraction.length);return n>0n?{n,d}:null;}
export function sameFxRate(a,b){const left=ratio(a),right=ratio(b);return Boolean(left&&right&&left.n*right.d===right.n*left.d);}
export function validFxQuote(quote,today){return quote&&ratio(quote.rate)&&day(quote.asOf)&&day(today)&&quote.asOf<=today&&!(quote.method==='blended_daily'&&Date.parse(today+'T00:00:00Z')-Date.parse(quote.asOf+'T00:00:00Z')>7*86400000)&&typeof quote.source==='string'&&quote.source.length>0&&quote.source.length<=120?quote:null;}
function quoteRatio(quote,currency){const value=ratio(quote.rate);if(!value)return null;if(quote.base===undefined&&quote.quote===undefined)return value;if(quote.base===currency&&quote.quote==='BRL')return value;if(quote.base==='BRL'&&quote.quote===currency)return {n:value.d,d:value.n};return null;}
function rounded(n,d){const sign=n<0n?-1n:1n,a=n<0n?-n:n;const value=sign*(a/d+(a%d*2n>=d?1n:0n));const number=Number(value);return Number.isSafeInteger(number)?number:null;}
export function convertFinancialMinor({amountMinor,from,to,quotes={},today,directQuote}={}) {
  const fromDigits=currencyMinorDigits(from),toDigits=currencyMinorDigits(to);
  if(!Number.isSafeInteger(amountMinor)||fromDigits===null||toDigits===null)return {state:'invalid',amountMinor:null};
  if(from===to)return {state:'available',amountMinor,references:[]};
  let rate,references=[];
  if(directQuote){const q=validFxQuote(directQuote,today);if(!q)return {state:'unavailable',amountMinor:null};rate=ratio(q.rate);references=[q];}
  else {const a=from==='BRL'?{rate:'1',asOf:today,source:'BRL'}:validFxQuote(quotes[from],today),b=to==='BRL'?{rate:'1',asOf:today,source:'BRL'}:validFxQuote(quotes[to],today);if(!a||!b)return {state:'unavailable',amountMinor:null};if(from!=='BRL'&&to!=='BRL'&&a.asOf!==b.asOf)return {state:'incompatible_dates',amountMinor:null};const ar=from==='BRL'?ratio('1'):quoteRatio(a,from),br=to==='BRL'?ratio('1'):quoteRatio(b,to);if(!ar||!br)return {state:'incompatible_pair',amountMinor:null};if(from!=='BRL'&&to!=='BRL'&&(a.method||'account_manual')!==(b.method||'account_manual'))return {state:'incompatible_methods',amountMinor:null};rate={n:ar.n*br.d,d:ar.d*br.n};references=[...(from==='BRL'?[]:[a]),...(to==='BRL'?[]:[b])];}
  const amount=rounded(BigInt(amountMinor)*rate.n*10n**BigInt(toDigits),rate.d*10n**BigInt(fromDigits));
  return {state:amount===null?'invalid':'available',amountMinor:amount,references};
}
// Accept binary representation noise only; never round a real sub-minor amount.
export function majorNumberToMinor(value,currency){const digits=currencyMinorDigits(currency);if(digits===null||!Number.isFinite(value))return null;const scaled=value*10**digits,minor=Math.round(scaled);return Number.isSafeInteger(minor)&&Math.abs(scaled-minor)<=1e-6?minor:null;}
export function estimateAllowanceBrl({lines,quotes={},today,incomplete=false}={}) {
  if(!Array.isArray(lines)||!lines.length)return {state:'no_data',amountMinor:null,items:[]};
  const seen=new Map(),items=[];let sum=0,known=0,partial=incomplete;
  const dates=new Set(lines.flatMap(line=>line.currency!=='BRL'&&validFxQuote(quotes[line.currency],today)?[quotes[line.currency].asOf]:[]));
  for(const line of lines){const key=line.id;if(typeof key!=='string'||!key||seen.has(key)){partial=true;return {state:'incomplete',amountMinor:null,items:[]};}seen.set(key,true);const amount=majorNumberToMinor(line.value,line.currency);let result=amount===null?{state:'invalid',amountMinor:null}:convertFinancialMinor({amountMinor:amount,from:line.currency,to:'BRL',quotes,today});if(dates.size>1&&line.currency!=='BRL')result={state:'incompatible_dates',amountMinor:null};items.push({...line,originalMinor:amount,convertedMinor:result.amountMinor,state:result.state,references:result.references||[]});if(result.amountMinor===null)partial=true;else{sum+=result.amountMinor;known++;if(!Number.isSafeInteger(sum))return {state:'incomplete',amountMinor:null,items};}}
  return {state:partial?'partial':'available',amountMinor:known?sum:null,items};
}
export {decimalToMinor};
