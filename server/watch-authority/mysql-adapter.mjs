import { randomBytes } from 'node:crypto';
import { PURPOSE, issueGrant, redeemGrant, revokeGrant } from './policy.mjs';
// No connection, default pool, env, HTTP or schema initialization. All identifiers
// are static; only values are supplied to mysql2-compatible execute placeholders.
export const SQL = Object.freeze({
  find: 'SELECT record_json, version FROM crewcheck_watch_grants WHERE proof_id = ?',
  lock: 'SELECT record_json, version FROM crewcheck_watch_grants WHERE proof_id = ? FOR UPDATE',
  insert: 'INSERT INTO crewcheck_watch_grants (proof_id, record_json, version) VALUES (?, ?, 1)',
  cas: 'UPDATE crewcheck_watch_grants SET record_json = ?, version = version + 1 WHERE proof_id = ? AND version = ?',
});
const validId = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const denied = reason => Object.freeze({ok:false,reason});
export function createMysqlWatchGrantAdapter({ pool, authorityProducer, clock, nonce = () => randomBytes(32).toString('hex') }) {
  if (!pool?.getConnection || !clock || !authorityProducer?.lockCurrentGetMe || !authorityProducer?.lockCurrentSession || !authorityProducer?.lockRevocation)
    throw new TypeError('Explicit transaction pool, clock and REAL authority producer required');
  // The host producer MUST authenticate getMeContext itself. Never pass request
  // JSON as an authority; the adapter accepts only a host capability/context.
  async function transaction(work) {
    const c = await pool.getConnection();
    try {
      // Fresh committed epoch after waiting on its lock, including under MySQL's
      // default REPEATABLE READ. No state/authority cached across transactions.
      await c.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await c.beginTransaction();
      const result = await work(c);
      await c.commit(); // uncertain commit throws; never expose an accepted grant
      return result;
    } catch (error) { try { await c.rollback(); } catch {} throw error; }
    finally { c.release(); }
  }
  async function read(c,id,locked=false) {
    const [rows] = await c.execute(locked?SQL.lock:SQL.find,[id]);
    if (rows.length !== 1) return null;
    const row=rows[0];
    if (!Number.isSafeInteger(row.version)||row.version<1) throw new Error('Invalid journal version');
    const record=JSON.parse(row.record_json);
    if(record.proofId!==id) throw new Error('Corrupt grant binding');
    return {record,version:row.version};
  }
  async function replace(c,prior,next) {
    const [result]=await c.execute(SQL.cas,[JSON.stringify(next),prior.record.proofId,prior.version]);
    if(result.affectedRows!==1) throw new Error('Grant CAS failed');
  }
  return Object.freeze({
    async invalidateSession(hostContext) {
      if (!authorityProducer.invalidateSession) throw new Error('Session invalidator required');
      return transaction(c => authorityProducer.invalidateSession(c,hostContext));
    },
    async issueFromGetMe(getMeContext, nativeBinding) {
      return transaction(async c => {
        const authority=await authorityProducer.lockCurrentGetMe(c,getMeContext);
        const now=clock();const proofId=nonce();
        if(!validId(proofId)) throw new Error('CSPRNG proof ID required');
        // Server-owned identity only; client binding cannot override these fields.
        const binding={challenge:nativeBinding?.challenge,receiverChallenge:nativeBinding?.receiverChallenge,document:nativeBinding?.document,instance:nativeBinding?.instance,
          purpose:PURPOSE,owner:authority?.owner,session:authority?.session,epoch:authority?.epoch};
        const result=issueGrant(authority,binding,{now,proofId,proofDeadline:now+30_000,
          leaseDeadline:Math.min(now+300_000,authority?.expiresAt)});
        if(!result.ok)return result;
        await c.execute(SQL.insert,[proofId,JSON.stringify(result.record)]);
        return result;
      });
    },
    async consume(request) {
      if(!validId(request?.proofId))return denied('invalid_proof');
      return transaction(async c=>{
        // Discovery is not authority. All writers lock canonical session FIRST,
        // grant SECOND; reread the record after locks before making a decision.
        const discovered=await read(c,request.proofId);if(!discovered)return denied('unknown_proof');
        const authority=await authorityProducer.lockCurrentSession(c,{owner:discovered.record.owner,session:discovered.record.session});
        const prior=await read(c,request.proofId,true);if(!prior)return denied('unknown_proof');
        const result=redeemGrant(authority,prior.record,request,clock());
        if(result.ok&&!result.idempotent)await replace(c,prior,result.record);
        return result;
      });
    },
    async revokeFromHost(hostContext,proofId) {
      if(!validId(proofId))return denied('invalid_proof');
      return transaction(async c=>{
        const discovered=await read(c,proofId);if(!discovered)return denied('unknown_proof');
        const authorization=await authorityProducer.lockRevocation(c,hostContext,{owner:discovered.record.owner,session:discovered.record.session});
        if(authorization?.authorized!==true || authorization.owner!==discovered.record.owner || authorization.session!==discovered.record.session)
          return denied('revocation_authority_required');
        const prior=await read(c,proofId,true);if(!prior)return denied('unknown_proof');
        if(prior.record.owner!==authorization.owner||prior.record.session!==authorization.session)return denied('binding_mismatch');
        if(prior.record.state==='revoked')return Object.freeze({ok:true,idempotent:true});
        await replace(c,prior,revokeGrant(prior.record));
        // Permanent tombstone; no upsert, deletion or automatic reissue by proof ID.
        return Object.freeze({ok:true,idempotent:false});
      });
    },
  });
}
