import { useEffect, useRef, useState } from 'react';
import { getConfirmedPlatformProfile, saveConfirmedDisplayName, type PlatformProfile } from '../../lib/platformClient';
import './profile-name-editor.css';

export default function ProfileNameEditor({ onSaved }: { onSaved?: (profile: PlatformProfile) => void }) {
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    async function load() {
      const current = ++generation.current;
      setProfile(null); setName(''); setMessage(''); setBusy(true);
      try {
        const confirmed = await getConfirmedPlatformProfile();
        if (current === generation.current) { setProfile(confirmed); setName(confirmed.displayName); }
      } catch { if (current === generation.current) setMessage('Não foi possível carregar seu perfil. Tente novamente ao abrir esta tela.'); }
      finally { if (current === generation.current) setBusy(false); }
    }
    const storage = (event: StorageEvent) => { if (!event.key || ['crewcheck_auth_user', 'crewcheck_auth_token'].includes(event.key)) void load(); };
    const events = ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired'];
    void load();
    events.forEach(event => window.addEventListener(event, load)); window.addEventListener('storage', storage);
    return () => { generation.current++; events.forEach(event => window.removeEventListener(event, load)); window.removeEventListener('storage', storage); };
  }, []);
  async function save() {
    const current = ++generation.current;
    setBusy(true); setMessage('');
    try {
      const confirmed = await saveConfirmedDisplayName(name);
      if (current !== generation.current) return;
      setProfile(confirmed); setName(confirmed.displayName); onSaved?.(confirmed); setMessage('Nome salvo na sua conta.');
    } catch { if (current === generation.current) setMessage('Não foi possível confirmar a gravação. Confira sua conexão e tente novamente.'); }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <form className="cp-box cp-profile-name" aria-label="Nome do perfil" onSubmit={event => { event.preventDefault(); void save(); }}>
    <h2>Seu nome no CrewCheck</h2><p>Este nome aparece no seu perfil. Seu e-mail de login e seu ID continuam os mesmos.</p>
    <div className="cp-form"><label><span>Nome exibido</span><input value={name} maxLength={120} required disabled={!profile || busy} onChange={event => setName(event.target.value)}/></label></div>
    <div className="cp-actions"><button className="cp-primary" disabled={!profile || busy || !name.trim() || name.trim() === profile.displayName}>{busy ? 'Aguarde...' : 'Salvar nome'}</button><button type="button" disabled={!profile || busy} onClick={() => { setName(profile?.displayName || ''); setMessage(''); }}>Cancelar</button></div>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
