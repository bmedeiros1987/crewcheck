import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
// Local-only static fixture host. Never proxies, redirects or contacts an upstream.
export async function startFixtureServer({root,port=17347}={}) {
 const base=await fs.realpath(root);
 const server=http.createServer(async(req,res)=>{
  const origin=`http://127.0.0.1:${server.address().port}`;
  res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ${origin} blob:; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(403);return res.end();}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,origin).pathname);}catch{res.writeHead(400);return res.end();}
  if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});return res.end('{"error":"QA_SYNTHETIC_UNAVAILABLE"}');}
  if(pathname==='/'||pathname==='/app')pathname='/index.html';
  try{
   const target=await fs.realpath(path.resolve(base,'.'+pathname));
   if(!target.startsWith(base+path.sep)){res.writeHead(403);return res.end();}
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[path.extname(target)];
   if(!mime){res.writeHead(403);return res.end();}
   const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end();}
 });
 server.on('upgrade',(_req,socket)=>socket.destroy());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return server;
}
