// Non-secret configuration check only; not proof of ingress health, signature,
// sender ownership or provider delivery. Never resolves a credential or pool.
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
    const explicit = environment.CREWCHECK_WHATSAPP_NUMBER || environment.WHATSAPP_BUSINESS_NUMBER;
    // An old Meta destination must not silently capture an Infobip challenge.
    if (explicit && String(explicit).replace(/\D/g, '') !== sender) return '';
    return sender;
  } catch { return ''; }
}
