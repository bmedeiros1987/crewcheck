import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, HeartPulse, Loader2, Phone, ShieldCheck, UserRound } from 'lucide-react';
import '../components/v14316/control-center.css';

type Card = {
  displayName?: string;
  crewId?: string;
  bloodType?: string;
  allergies?: string;
  medications?: string;
  conditions?: string;
  criticalNotes?: string;
  emergencyContact?: { name?: string; relationship?: string; phone?: string };
  privacy?: string;
};

export default function GuardianPublicPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [card, setCard] = useState<Card | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token) { setError('QR Guardian inválido.'); return; }
    fetch(`/api/guardian/card?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.ok) throw new Error(payload.message || 'Cartão indisponível.'); setCard(payload.card); setExpiresAt(payload.expiresAt || ''); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Cartão indisponível.'));
  }, [token]);

  if (!card && !error) return <main className="cc-guardian-public"><section><Loader2 className="cc-spin"/><h1>Abrindo CrewCheck Guardian</h1></section></main>;
  if (error) return <main className="cc-guardian-public"><section className="error"><AlertTriangle/><h1>QR Guardian indisponível</h1><p>{error}</p><small>Peça ao titular para gerar um novo QR no CrewCheck.</small></section></main>;

  const items = [
    ['Tipo sanguíneo', card?.bloodType], ['Alergias', card?.allergies], ['Medicamentos', card?.medications], ['Condições/cuidados', card?.conditions], ['Observação crítica', card?.criticalNotes],
  ].filter(([, value]) => String(value || '').trim());
  const contact = card?.emergencyContact;

  return <main className="cc-guardian-public"><section className="card">
    <header><span><ShieldCheck/></span><div><small>CREWCHECK GUARDIAN · SOMENTE LEITURA</small><h1>{card?.displayName || 'Tripulante'}</h1><p>{card?.crewId ? `ID ${card.crewId}` : 'Identificação protegida pelo titular'}</p></div></header>
    <div className="verified"><HeartPulse/><div><strong>Cartão válido e verificado</strong><span>{expiresAt ? `Expira em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(expiresAt))}` : 'Validade temporária'}</span></div></div>
    <div className="guardian-data">{items.length ? items.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>) : <article><span>Dados médicos</span><strong>Nenhuma informação adicional compartilhada.</strong></article>}</div>
    {contact?.phone && <a className="guardian-contact" href={`tel:${String(contact.phone).replace(/[^+\d]/g, '')}`}><Phone/><div><small>CONTATO DE EMERGÊNCIA</small><strong>{contact.name || 'Contato'}{contact.relationship ? ` · ${contact.relationship}` : ''}</strong><span>{contact.phone}</span></div></a>}
    <footer><UserRound/><p>{card?.privacy || 'Acesso temporário autorizado pelo titular. Não substitui avaliação médica.'}</p></footer>
  </section></main>;
}
