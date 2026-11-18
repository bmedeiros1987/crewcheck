import http from 'node:http';
import {INFOBIP_WHATSAPP_CALLBACK_PATH,INFOBIP_WHATSAPP_DELIVERY_PATH,INFOBIP_WHATSAPP_SEEN_PATH} from './infobip-whatsapp-runtime.mjs';

const listeners=new WeakSet();
const createNativeHttpServer=http.createServer.bind(http);
// Own the existing HTTP listener, not another port/proxy/TLS terminator. Private
// construction provenance is never presented as evidence of Render or TLS.
export function createInfobipRenderHttpServer(onRequest) {
  const server=createNativeHttpServer(onRequest);
  listeners.add(server);
  return server;
}
const paths=new Set([INFOBIP_WHATSAPP_CALLBACK_PATH,INFOBIP_WHATSAPP_DELIVERY_PATH,INFOBIP_WHATSAPP_SEEN_PATH]);
const fail=()=>{throw Error('INFOBIP_RENDER_INGRESS');};
export function snapshotInfobipRenderIngress(input,listener) {
  if(input?.mode!=='render-managed-hmac'||!listeners.has(listener)||
      input.trustModel!=='render-edge-tls-private-http'||
      typeof input.serviceId!=='string'||!/^srv-[a-z0-9]+$/.test(input.serviceId)||input.serviceId.length>160)fail();
  const url=new URL(input.publicOrigin);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail();
  const allowed=input.callbackPaths;
  if(!Array.isArray(allowed)||!allowed.length||allowed.length>3||new Set(allowed).size!==allowed.length||allowed.some(path=>!paths.has(path)))fail();
  return Object.freeze({mode:'render-managed-hmac',trustModel:'render-edge-tls-private-http',
    serviceId:input.serviceId,publicOrigin:url.origin,callbackPaths:Object.freeze([...allowed].sort())});
}
export function createInfobipRenderIngressPolicy(input,listener,binding) {
  const ingress=snapshotInfobipRenderIngress(input,listener);
  if(binding?.renderServiceId!==ingress.serviceId||binding.publicOrigin!==ingress.publicOrigin||
      !Array.isArray(binding.callbackPaths)||JSON.stringify([...binding.callbackPaths].sort())!==JSON.stringify(ingress.callbackPaths))fail();
  const host=new URL(ingress.publicOrigin).host,allowed=new Set(ingress.callbackPaths);
  return Object.freeze({mode:ingress.mode,requiresHmac:true,transport:'managed-http',proxyAuthenticated:false,
    inspect(req,url) {
      const hosts=[];
      if(!Array.isArray(req?.rawHeaders)||req.rawHeaders.length%2)return false;
      for(let i=0;i<req.rawHeaders.length;i+=2)if(String(req.rawHeaders[i]).toLowerCase()==='host')hosts.push(req.rawHeaders[i+1]);
      return req.socket?.server===listener&&hosts.length===1&&typeof hosts[0]==='string'&&
        hosts[0].toLowerCase()===host&&req.headers?.host?.toLowerCase()===host&&
        url.protocol==='http:'&&url.host===host&&!url.search&&allowed.has(url.pathname);
    },
  });
}
