import { useEffect, useState } from 'react';
import { Link2, ShieldCheck, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import {
  getGoogleIdentityConnection,
  linkGoogleIdentity,
  unlinkGoogleIdentity,
  type GoogleIdentityConnection,
} from '@/lib/googleIdentityAuth';

export default function GoogleIdentityLinkCard() {
  const [connection, setConnection] = useState<GoogleIdentityConnection | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try { setConnection(await getGoogleIdentityConnection()); }
    catch { setConnection({ ok: false, linked: false }); }
  }

  useEffect(() => { void refresh(); }, []);

  async function link() {
    if (!window.confirm('Vincular uma Conta Google a esta conta CrewCheck? Isso permitirá entrar com Google no futuro. A permissão do Google Calendar continuará separada.')) return;
    setBusy(true);
    try {
      const result = await linkGoogleIdentity();
      setConnection(result);
      toast.success('Conta Google vinculada ao CrewCheck.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível vincular a Conta Google.');
    } finally { setBusy(false); }
  }

  async function unlink() {
    if (!window.confirm('Desvincular o login Google? Sua conta, escala e autorização separada do Google Calendar serão preservadas.')) return;
    setBusy(true);
    try {
      setConnection(await unlinkGoogleIdentity());
      toast.success('Login Google desvinculado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desvincular o login Google.');
    } finally { setBusy(false); }
  }

  const linked = Boolean(connection?.linked);
  return <section className="cz-toolbox" aria-labelledby="google-identity-heading">
    <h2 id="google-identity-heading">Login com Google</h2>
    <p>{linked ? `Vinculado${connection?.emailHint ? ` a ${connection.emailHint}` : ''}. Você já pode usar “Entrar com Google” na tela de acesso.` : 'Vincule explicitamente sua Conta Google para entrar sem senha. Isso não concede acesso ao Gmail nem ao Google Calendar.'}</p>
    <div className="cz-routine-strip"><span><ShieldCheck/> Escopos: identidade básica</span><span>Calendar separado</span></div>
    <div className="cz-tool-actions">
      {linked
        ? <button type="button" onClick={unlink} disabled={busy}><Unlink/> {busy ? 'Desvinculando…' : 'Desvincular login Google'}</button>
        : <button type="button" onClick={link} disabled={busy}><Link2/> {busy ? 'Aguardando Google…' : 'Vincular Conta Google'}</button>}
    </div>
  </section>;
}
