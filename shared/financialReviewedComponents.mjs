// Presentation-only evidence contract. Document producers must retain canonical
// row identity; an arbitrary UI row id cannot identify an observed source line.
export const CASH_KINDS=Object.freeze(['retention','consigned','advance']);
const key=v=>typeof v==='string'&&v.trim().length>0&&v.length<=256;
export const reviewedSource=s=>Boolean(s&&['manual_scenario','document_review'].includes(s.kind)&&key(s.id)&&key(s.itemId)&&Number.isSafeInteger(s.revision)&&s.revision>0&&s.reviewed===true);
export const sourceIdentity=s=>JSON.stringify([s.kind,s.id,s.revision,s.itemId]);
const documentIdentity=s=>JSON.stringify([s.kind,s.id]);
export function reviewedComponents(rows,{earning=false,periodIds=null}={}){
 if(!Array.isArray(rows)||rows.length>128)return false;
 const ids=new Set(),origins=new Set(),components=new Set(),revisions=new Map(),buckets=new Map(),representations=new Map();
 for(const row of rows){
  if(!row||!key(row.id)||ids.has(row.id)||!key(row.component)||!reviewedSource(row.source)||!Number.isSafeInteger(row.amountMinor)||row.amountMinor<0||row.amountMinor>1e12)return false;
  if(periodIds&&!periodIds.has(row.periodId))return false;
  if(earning&&!['monthly_average','period_amount'].includes(row.basis))return false;
  if(!earning&&!CASH_KINDS.includes(row.kind))return false;
  const revisionKey=documentIdentity(row.source),oldRevision=revisions.get(revisionKey);
  if(oldRevision!==undefined&&oldRevision!==row.source.revision)return false;
  revisions.set(revisionKey,row.source.revision);ids.add(row.id);
  // A monthly mean can be explicitly applied to two concessions. A paid
  // advance or an already-proportional line cannot silently be spent twice.
  const identity=sourceIdentity(row.source),representation=JSON.stringify([row.basis??row.kind,row.amountMinor,row.component]);
  const previous=representations.get(identity);
  if(previous!==undefined&&(!earning||row.basis!=='monthly_average'||previous!==representation))return false;
  representations.set(identity,representation);
  const origin=sourceIdentity(row.source)+(earning&&row.basis==='monthly_average'?'|'+row.periodId:'');
  if(origins.has(origin))return false;origins.add(origin);
  const bucket=JSON.stringify([row.periodId??'',earning?'earning':row.kind]);
  const component=bucket+'|'+row.component;
  if(components.has(component))return false;components.add(component);
  const seen=buckets.get(bucket)||[];seen.push(row.component);buckets.set(bucket,seen);
  if(seen.length>1&&seen.includes('total'))return false;
 }
 return true;
}
export function cashCoverage(rows,periodId){
 const selected=periodId===undefined?rows:rows.filter(row=>row.periodId===periodId);
 return CASH_KINDS.every(kind=>selected.some(row=>row.kind===kind));
}
export function compatibleSourceSets(earnings,deductions){
 const origins=new Set(earnings.map(row=>sourceIdentity(row.source))),versions=new Map(earnings.map(row=>[documentIdentity(row.source),row.source.revision]));
 return deductions.every(row=>!origins.has(sourceIdentity(row.source))&&(!versions.has(documentIdentity(row.source))||versions.get(documentIdentity(row.source))===row.source.revision));
}
export const cashState=amount=>amount===null?'pending':amount<0?'negative_review':amount===0?'balanced':'receivable';
