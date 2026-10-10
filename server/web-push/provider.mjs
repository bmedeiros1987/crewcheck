import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { validateSubscription } from './installationRegistry.mjs';
export function publicPushAddress(address) {
  if (net.isIP(address) === 4) {
    const p = address.split('.').map(Number);
    return p[0] > 0 && p[0] < 224 && p[0] !== 10 && p[0] !== 127 && !(p[0] === 169 && p[1] === 254) && !(p[0] === 172 && p[1] >= 16 && p[1] <= 31) && !(p[0] === 192 && ([0,168].includes(p[1])||(p[1]===88&&p[2]===99))) && !(p[0] === 100 && p[1] >= 64 && p[1] <= 127) && !(p[0] === 198 && [18,19,51].includes(p[1])) && !(p[0] === 203 && p[1] === 0 && p[2] === 113);
  }
  if(net.isIP(address)!==6)return false;const normalized=new URL(`http://[${address}]/`).hostname.slice(1,-1);
  return /^2[0-9a-f]{3}:/i.test(normalized)&&!/^2002:/i.test(normalized)&&!/^2001:(?:db8:|:|0:|10:|20:)/i.test(normalized);
}
export function guardedLookup(host, options, callback, lookup = dns.lookup) {
  lookup(host, { all: true, verbatim: true }, (error, addresses) => {
    if (error || !addresses?.length || addresses.some(item => !publicPushAddress(item.address))) return callback(Object.assign(new Error('Destino externo não permitido.'), { code: 'PUSH_ADDRESS_BLOCKED' }));
    const selected = options?.family ? addresses.filter(item => item.family === options.family) : addresses;
    if (!selected.length) return callback(Object.assign(new Error('Destino externo indisponível.'), { code: 'PUSH_ADDRESS_BLOCKED' }));
    if (options?.all) callback(null, selected); else callback(null, selected[0].address, selected[0].family);
  });
}
export async function sendCrewCheckPush(subscription, envelope, configuration, { load = () => import('web-push'), now = Date.now(), clock = () => now } = {}) {
  if (configuration?.enabled !== true || configuration?.configured !== true) return { status: 'disabled', received: null };
  const checked = validateSubscription(subscription), seconds = Math.floor((Date.parse(envelope.expiresAt) - now) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return { status: 'expired', received: null };
  const library = await load(), provider = library.default || library;
  const remaining=Math.floor((Date.parse(envelope.expiresAt)-clock())/1000);if(!Number.isFinite(remaining)||remaining<=0)return{status:'expired',received:null};
  const agent = new https.Agent({ keepAlive: false, lookup: guardedLookup });
  try {
    const response = await provider.sendNotification(checked, JSON.stringify(envelope), { vapidDetails: { subject: configuration.subject, publicKey: configuration.publicKey, privateKey: configuration.privateKey }, agent, TTL: Math.min(remaining, 86400), timeout: 5000, contentEncoding: 'aes128gcm', urgency: 'normal' });
    return { status: response.statusCode >= 200 && response.statusCode < 300 ? 'accepted_unconfirmed' : 'uncertain', received: null };
  } catch (error) { return { status: [404,410].includes(error?.statusCode) ? 'expired_subscription' : 'uncertain', received: null }; }
  finally { agent.destroy(); }
}
