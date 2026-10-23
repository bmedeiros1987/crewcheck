import {createHash} from 'node:crypto';

// Opaque, stable across processes; no email, phone or credential in the ledger.
export const infobipEngineOwner = publicId => createHash('sha256')
  .update(JSON.stringify(['infobip-engine-owner-v1',publicId])).digest('hex');

// Called only after authenticated account mutation, using its existing client.
// A durable active/unknown marker never expires into permission to erase data.
export async function assertInfobipAccountQuiescent(c,email,{checkTable=true}={}) {
  if(checkTable){
    const [tables]=await c.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',['crewcheck_telegram_state']);
    if(!tables.length)return;
  }
  const [owners]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
  if(!owners.length)return;
  const [active]=await c.query(`SELECT state_key FROM crewcheck_telegram_state
    WHERE state_key LIKE 'crewcheck-infobip-inbound-v1:%'
    AND CAST(state_key AS BINARY)>? AND CAST(state_key AS BINARY)<?
    AND ((JSON_EXTRACT(payload,'$.engineActive')=true AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.engineOwner'))=?)
      OR (JSON_UNQUOTE(JSON_EXTRACT(payload,'$.status'))='preparing' AND JSON_EXTRACT(payload,'$.engineActive') IS NULL))
    LIMIT 1 FOR UPDATE`,['crewcheck-infobip-inbound-v1:','crewcheck-infobip-inbound-v1:~',infobipEngineOwner(owners[0].public_id)]);
  if(active.length)throw Error('WHATSAPP_REVOCATION_PENDING');
}
