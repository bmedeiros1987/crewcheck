import {createHash}from'node:crypto';
export function stampServiceWorkerBuild(source,html,assets=[]){
 const entry=html.match(/<script[^>]+src=["'](\/assets\/[^"']+\.js)["']/)?.[1];
 if(!entry)throw Error('Prepared entry script missing; worker build not stamped');
 const urls=[...new Set(assets)].sort();
 if(urls.some(url=>!/^\/assets\/[A-Za-z0-9_.\/-]+$/.test(url)||url.includes('..')))throw Error('Invalid build asset URL');
 const id=createHash('sha256').update(html+JSON.stringify(urls)).digest('hex').slice(0,20);
 if(!source.includes('__CREWCHECK_UPDATE_BUILD_ID__')||!source.includes('__CREWCHECK_UPDATE_ENTRY__'))throw Error('Worker build markers missing');
 let result=source.replace('const CREWCHECK_UPDATE_ASSETS=[];',`const CREWCHECK_UPDATE_ASSETS=${JSON.stringify(urls)};`).replaceAll('__CREWCHECK_UPDATE_BUILD_ID__',id).replaceAll('__CREWCHECK_UPDATE_ENTRY__',entry).replaceAll('__CREWCHECK_UPDATE_HTML_HASH__',createHash('sha256').update(html).digest('hex'));
 for(const name of ['CACHE_NAME','RUNTIME_CACHE']){const pattern=new RegExp(`const ${name} = '([^']+)';`);if(!pattern.test(result))throw Error('Worker cache marker missing');result=result.replace(pattern,(_all,base)=>`const ${name} = '${base}-${id}';`);}
 return{source:result,buildId:id,entry};
}
