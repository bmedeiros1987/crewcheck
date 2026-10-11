// Browser fixture validation only. Production callers never import this module.
import net from 'node:net';
import {syncBuiltinESMExports} from 'node:module';
const local=host=>['127.0.0.1','::1','localhost','[::1]'].includes(host);
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const options=args[0];const host=typeof options==='object'?options.host:(typeof args[1]==='string'?args[1]:'localhost');if(!local(host||'localhost')||options?.path)throw Error('Experiment blocks non-loopback network');return connect.apply(this,args);};
const fetch=globalThis.fetch;
globalThis.fetch=(input,...args)=>{if(!local(new URL(typeof input==='string'||input instanceof URL?input:input.url).hostname))throw Error('Experiment blocks non-loopback fetch');return fetch(input,...args);};
syncBuiltinESMExports();
