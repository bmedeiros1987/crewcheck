// Strict DB transport for the verified existing endpoint. Deployment changes app
// transport even while the independent release receiver and publication stay OFF.
import { readFileSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';

const HOST = 'mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com';
const PORT = 22966;
const PEM_SHA256 = '188afc99d79b9c310157993fc6a9b19946cee2dab08f4c60ad7ac5dbd00cbc38';
const DER_SHA256 = '6557c74f72b8d8216afa68df498ceb17c582544806c06f1630d470160d26a6be';

export function verifiedMysqlTls(host, port, mode = '') {
  try {
    if (host !== HOST || Number(port) !== PORT ||
        !['', 'REQUIRED', 'VERIFY_CA', 'VERIFY_IDENTITY'].includes(String(mode).trim().toUpperCase())) {
      throw Error();
    }
    const ca = readFileSync(new URL('./certs/crewcheck-aiven-project-ca.pem', import.meta.url));
    if (ca.length !== 1541 || createHash('sha256').update(ca).digest('hex') !== PEM_SHA256 ||
        ca.includes(Buffer.from('PRIVATE KEY'))) throw Error();
    const certificate = new X509Certificate(ca);
    if (!certificate.ca || createHash('sha256').update(certificate.raw).digest('hex') !== DER_SHA256 ||
        Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) {
      throw Error();
    }
    // mysql2 normalizes ssl options; each pool receives a fresh mutable object.
    return { ca, rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' };
  } catch {
    throw Object.assign(Error('MYSQL_TLS_TRUST_UNVERIFIED'), { code: 'MYSQL_TLS_TRUST_UNVERIFIED' });
  }
}
