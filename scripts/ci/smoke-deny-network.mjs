// Loaded only by the smoke test's build/start children, never by production.
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
const deny = () => { throw new Error('Smoke test blocks all outbound network and production connections'); };
globalThis.fetch = deny;
net.Socket.prototype.connect = deny;
http.request = deny;
http.get = deny;
https.request = deny;
https.get = deny;
syncBuiltinESMExports();
