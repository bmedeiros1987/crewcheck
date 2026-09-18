import { useEffect, useState } from 'react';
import { authFetch } from '../lib/authClient';

export default function TvPairPage() {
  const [code, setCode] = useState(new URLSearchParams(location.search).get('code') || '');
  const [privacy, setPrivacy] = useState('family');
  const [message, setMessage] = useState('');
  const [devices, setDevices] = useState<any[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [retry, setRetry] = useState(0);
  // Public readiness reveals no account information. Device approval/list/revoke
  // remain authenticated and restricted on the server, regardless of this UI.
  useEffect(() => {
    let alive = true;
    setEnabled(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    fetch('/api/tv/status', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(value => { if (alive) setEnabled(value?.schemaVersion === 1 && value?.available === true && value?.mode === 'restricted-pilot'); })
      .catch(() => { if (alive) setEnabled(false); })
      .finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [retry]);
  const refresh = () => authFetch<any[]>('/api/tv/devices')
    .then(value => setDevices(Array.isArray(value) ? value : []))
    .catch(() => setMessage('Dispositivos indisponíveis ou conta fora do piloto.'));
  useEffect(() => { if (enabled) void refresh(); }, [enabled]);
  async function approve() {
    try {
      await authFetch('/api/tv/approve', { method:'POST', body:JSON.stringify({userCode:code.toUpperCase().trim(), privacy}) });
      setMessage('Autorização registrada. Aguarde a TV confirmar o vínculo e confira sua escala.');
      setCode('');
    } catch { setMessage('Não foi possível autorizar. Confira sua conta, o código e a disponibilidade do piloto.'); }
  }
  if (!enabled) return <main className="mx-auto max-w-xl p-8">
    <h1 className="text-3xl font-bold">CrewCheck TV</h1>
    <p className="my-4" role="status">{enabled === null ? 'Verificando a disponibilidade do piloto…' : 'O vínculo real ainda não está disponível neste ambiente. Nenhum dispositivo foi autorizado.'}</p>
    {enabled === false && <button className="rounded border p-3" onClick={() => setRetry(value => value + 1)}>Verificar novamente</button>}
  </main>;
  return <main className="mx-auto max-w-xl p-8">
    <h1 className="text-3xl font-bold">Vincular CrewCheck TV</h1>
    <p className="my-4">Piloto restrito. Confira o código exibido na sua TV antes de autorizar.</p>
    <label>Código da TV<input className="block w-full rounded border p-3 text-black" value={code} maxLength={10} onChange={event => setCode(event.target.value)}/></label>
    <label className="my-4 block">Privacidade<select className="block p-3 text-black" value={privacy} onChange={event => setPrivacy(event.target.value)}>
      <option value="family">Família — sem rota e número de voo</option>
      <option value="private">Privado — mostrar rota e número de voo</option>
    </select></label>
    <button className="rounded bg-cyan-700 p-3 text-white" onClick={approve} disabled={!/^[A-F0-9]{10}$/i.test(code)}>Autorizar esta TV por 24 horas</button>
    <p role="status" className="my-4">{message}</p>
    <h2 className="text-xl font-bold">Minhas TVs</h2><button onClick={refresh}>Atualizar dispositivos</button>
    {devices.map(device => <article key={device.deviceId} className="my-4 rounded border p-4">
      <p>{device.platform} · {device.privacy} · {device.revoked ? 'Revogada' : 'Vinculada'}</p>
      <p>Último contato: {new Date(device.lastSeenAt).toLocaleString('pt-BR')}</p>
      <button disabled={device.revoked} onClick={async () => {
        try { await authFetch('/api/tv/revoke', {method:'POST',body:JSON.stringify({deviceId:device.deviceId})}); await refresh(); }
        catch { setMessage('Não foi possível revogar agora. Tente novamente.'); }
      }}>Revogar acesso</button>
    </article>)}
  </main>;
}
