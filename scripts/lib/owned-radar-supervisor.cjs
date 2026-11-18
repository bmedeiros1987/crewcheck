const markers={gate:'ORACLE_GATE',date:'ORACLE_OCCURRENCE',provider:'ORACLE_PROVIDER'};
function acceptsOwnedRadarResult(child,mutation=''){
 if(child.error!=null||child.signal!==null||!Number.isInteger(child.status)||child.status<0||child.status>255)return false;
 const text=(child.stdout||'')+(child.stderr||'');
 const observed=text.match(/\bORACLE_[A-Z_]+\b/g)||[];
 if(!mutation)return child.status===0&&observed.length===0;
 const expected=markers[mutation];
 return Boolean(expected&&child.status>0&&observed.length>0&&observed.every(marker=>marker===expected));
}
module.exports={acceptsOwnedRadarResult};
