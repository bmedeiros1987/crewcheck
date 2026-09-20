function decodeXml(value=''){
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}
function tag(block,name){
  const match=String(block).match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
  return match?decodeXml(match[1]).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim():'';
}
function entryLink(block){
  const href=String(block).match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
  if(href)return decodeXml(href).trim();
  return tag(block,'link');
}
export async function fetchRssItems(source,{signal,redirect='error'}={}){
  const response=await fetch(source.url,{
    signal,
    redirect,
    headers:{accept:'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5','user-agent':'CrewCheck-TV/0.4 (+https://crewcheck.online)'}
  });
  if(!response.ok)throw new Error('feed_http_'+response.status);
  const xml=await response.text();
  if(xml.length>2_000_000)throw new Error('feed_too_large');
  const blocks=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match=>match[1]);
  if(!blocks.length)blocks.push(...[...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(match=>match[1]));
  return blocks.slice(0,80).flatMap(block=>{
    const title=tag(block,'title');
    const url=entryLink(block);
    const publishedAt=tag(block,'pubDate')||tag(block,'published')||tag(block,'updated')||tag(block,'dc:date');
    return title&&url&&publishedAt?[{title,url,publishedAt}]:[];
  });
}
