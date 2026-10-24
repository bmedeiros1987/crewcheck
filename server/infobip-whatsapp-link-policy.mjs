// Non-secret configuration check only; not proof of ingress health, signature,
// sender ownership or provider delivery. Never resolves a credential or pool.
export async function infobipCanonicalLinkStatus(link, {hashPhone, ownerReady=false, environment=process.env, now=Date.now()}={}) {
  const result={provider:'infobip',recorded:Boolean(link),linked:false,canonicalVerified:false,testWindow:'unavailable',linkStartAvailable:false};
  try {
    const {validateInfobipSingleTestPolicy}=await import('./infobip-whatsapp-single-test.mjs');
    const policy=validateInfobipSingleTestPolicy(JSON.parse(environment.CREWCHECK_INFOBIP_WHATSAPP_POLICY));
    const {configuration:c,admission:a}=policy;
    if(c.authentication!=='hmac-sha256'||!/^[1-9]\d{7,14}$/.test(c.sender)||
      !c.allowedSenders?.includes(c.sender)||c.deploymentBinding?.sender!==c.sender||!Number.isFinite(now))return result;
    result.testWindow=now<a.validFrom?'not_started':now>=a.validUntil?'expired':'active';
    result.linkStartAvailable=Boolean(await infobipCanonicalLinkDestination(environment,now));
    // Status is scoped to the one approved recipient and the authenticated
    // account's row. A last-four display or an old row alone is not this proof.
    // Never return the recipient, its hash, a key, or the owning account.
    const recipient=a.recipients[0];
    const verified=Boolean(link&&ownerReady&&link.revoked_at===null&&link.linked_at&&link.updated_at&&
      typeof hashPhone==='function'&&/^[a-f0-9]{64}$/.test(link.phone_hash||'')&&
      link.phone_hash===hashPhone(recipient)&&String(link.phone_last4||'')===recipient.slice(-4));
    result.linked=verified;result.canonicalVerified=verified;
    return result;
  } catch {return result;}
}

export async function infobipCanonicalLinkDestination(environment = process.env, now = Date.now()) {
  try {
    const { validateInfobipSingleTestPolicy } = await import('./infobip-whatsapp-single-test.mjs');
    const policy = validateInfobipSingleTestPolicy(JSON.parse(environment.CREWCHECK_INFOBIP_WHATSAPP_POLICY));
    const { configuration: configuration, admission } = policy;
    const sender = configuration.sender;
    if (configuration.canonicalLinkHandshake !== true || configuration.authentication !== 'hmac-sha256' ||
        !/^[1-9]\d{7,14}$/.test(sender) || !configuration.allowedSenders?.includes(sender) ||
        configuration.deploymentBinding?.sender !== sender ||
        !Number.isFinite(now) || now < admission.validFrom || now >= admission.validUntil) return '';
    // The authenticated start action explicitly selects provider=infobip.
    // Its destination is the policy-bound sender above, never a legacy Meta
    // alias. Legacy callers keep their own existing alias precedence.
    return sender;
  } catch { return ''; }
}
