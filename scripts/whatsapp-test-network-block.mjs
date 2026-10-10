import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
// Test process only. Errors carry no URL, phone, payload, token or provider text.
const blocked = () => { throw Object.assign(new Error('TEST_NETWORK_BLOCKED'), { code: 'TEST_NETWORK_BLOCKED' }); };
globalThis.fetch = async () => blocked();
net.Socket.prototype.connect = blocked;
http.request = blocked; http.get = blocked;
https.request = blocked; https.get = blocked;
syncBuiltinESMExports();
