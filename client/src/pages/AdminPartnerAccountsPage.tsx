import { useEffect, useMemo, useState } from 'react';
import { authFetch, getStoredUser } from '../lib/authClient';

type PartnerRow = {
  email: string;
  partnerName: string;
  contactName: string;
  notes?: string | null;
  plan?: string;
  mustChangePassword?: number | boolean;
  createdAt?: string;
};

type CreatedAccount = {
  email: string;
  contactName: string;
  partnerName: string;
  temporaryPassword: string;
};

export default function AdminPartnerAccountsPage() {
  const user = getStoredUser();
  const isAdmin = String(user?.role || '').toLowerCase().includes('admin');
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [form, setForm] = useState({
    contactName: '',
    partnerName: '',
    email: '',
    temporaryPassword: '',
    notes: '',
    replaceExisting: false,
  });

  const credentialsText = useMemo(() => created ? [
    `Nome: ${created.contactName}`,
    `Organização: ${created.partnerName}`,
    `E-mail: ${created.email}`,
    `Senha temporária: ${created.temporaryPassword}`,
    'A senha deverá ser alterada no primeiro acesso.',
  ].join('\n') : '', [created]);

  async function loadPartners() {
    setLoading(true);
    setError('');
    try {
      const payload = await authFetch<{ ok: boolean; partners: PartnerRow[] }>('/api/admin/partner-accounts');
      setPartners(payload.partners || []);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as contas de parceiros.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void loadPartners();
    else setLoading(false);
  }, [isAdmin]);

  async function createPartner(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setCreated(null);
    try {
      const payload = await authFetch<any>('/api/admin/partner-accounts', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setCreated({ ...payload.account, temporaryPassword: payload.temporaryPassword });
      setForm({ contactName: '', partnerName: '', email: '', temporaryPassword: '', notes: '', replaceExisting: false });
      await loadPartners();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível criar a conta.');
    } finally {
      setSaving(false);
    }
  }

  async function copyCredentials() {
    if (!credentialsText) return;
    await navigator.clipboard.writeText(credentialsText);
  }

  if (!isAdmin) {
    return <main className="cc-partner-admin"><section className="cc-partner-card"><h1>Acesso restrito</h1><p>Esta área é exclusiva para administradores.</p><a href="/">Voltar ao CrewCheck</a></section></main>;
  }

  return (
    <main className="cc-partner-admin">
      <header className="cc-partner-header">
        <div><span>Administração</span><h1>Contas de parceiros</h1><p>Crie acessos Premium com senha temporária e troca obrigatória no primeiro login.</p></div>
        <a href="/">Voltar ao painel</a>
      </header>

      <section className="cc-partner-grid">
        <form className="cc-partner-card" onSubmit={createPartner}>
          <h2>Nova conta</h2>
          <label>Nome da pessoa<input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Daniela Arrebola" /></label>
          <label>Organização<input required value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} placeholder="Cirium" /></label>
          <label>E-mail corporativo<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nome@empresa.com" /></label>
          <label>Senha temporária <small>(opcional)</small><input value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} placeholder="Deixe em branco para gerar automaticamente" /></label>
          <label>Observações<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Contexto da parceria ou finalidade do acesso" /></label>
          <label className="cc-partner-check"><input type="checkbox" checked={form.replaceExisting} onChange={(e) => setForm({ ...form, replaceExisting: e.target.checked })} /> Redefinir o acesso caso o e-mail já exista</label>
          {error && <div className="cc-partner-error" role="alert">{error}</div>}
          <button type="submit" disabled={saving}>{saving ? 'Criando conta…' : 'Criar conta Premium'}</button>
        </form>

        <section className="cc-partner-card">
          <h2>Acesso gerado</h2>
          {created ? <div className="cc-credentials">
            <strong>{created.contactName}</strong><span>{created.partnerName}</span>
            <code>{created.email}</code><code>{created.temporaryPassword}</code>
            <p>A senha é exibida somente nesta confirmação. Guarde-a com segurança.</p>
            <button type="button" onClick={copyCredentials}>Copiar dados de acesso</button>
          </div> : <p>Após a criação, os dados temporários aparecerão aqui uma única vez.</p>}
        </section>
      </section>

      <section className="cc-partner-card cc-partner-list">
        <div className="cc-partner-list-title"><h2>Parceiros cadastrados</h2><button type="button" onClick={loadPartners}>Atualizar</button></div>
        {loading ? <p>Carregando…</p> : partners.length === 0 ? <p>Nenhuma conta de parceiro cadastrada.</p> : <div className="cc-partner-table-wrap"><table><thead><tr><th>Contato</th><th>Organização</th><th>E-mail</th><th>Plano</th><th>Primeiro acesso</th></tr></thead><tbody>{partners.map((partner) => <tr key={partner.email}><td>{partner.contactName}</td><td>{partner.partnerName}</td><td>{partner.email}</td><td>Premium</td><td>{partner.mustChangePassword ? 'Troca pendente' : 'Concluído'}</td></tr>)}</tbody></table></div>}
      </section>

      <style>{`
        .cc-partner-admin{min-height:100vh;padding:clamp(18px,4vw,48px);background:var(--background,#f4f7fb);color:var(--foreground,#122033);font-family:Inter,system-ui,sans-serif}.cc-partner-header{max-width:1180px;margin:0 auto 24px;display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.cc-partner-header span{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#3767d6}.cc-partner-header h1{margin:6px 0 8px;font-size:clamp(28px,5vw,46px)}.cc-partner-header p{margin:0;max-width:700px;color:#64748b}.cc-partner-header a,.cc-partner-card button{border:0;border-radius:12px;background:#173b77;color:white;text-decoration:none;padding:12px 16px;font-weight:800;cursor:pointer}.cc-partner-grid{max-width:1180px;margin:0 auto 24px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:20px}.cc-partner-card{background:var(--card,#fff);border:1px solid rgba(100,116,139,.2);border-radius:22px;padding:22px;box-shadow:0 14px 36px rgba(15,23,42,.08)}.cc-partner-card h2{margin:0 0 18px}.cc-partner-card label{display:grid;gap:7px;margin-bottom:14px;font-weight:750}.cc-partner-card input,.cc-partner-card textarea{width:100%;box-sizing:border-box;border:1px solid rgba(100,116,139,.32);border-radius:12px;padding:12px 14px;background:transparent;color:inherit;font:inherit}.cc-partner-card textarea{min-height:92px;resize:vertical}.cc-partner-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;font-weight:600!important}.cc-partner-check input{width:18px}.cc-partner-error{padding:12px;border-radius:12px;background:#fee2e2;color:#991b1b;margin-bottom:14px}.cc-credentials{display:grid;gap:10px}.cc-credentials code{padding:12px;border-radius:10px;background:rgba(51,65,85,.08);overflow-wrap:anywhere}.cc-credentials p{font-size:13px;color:#64748b}.cc-partner-list{max-width:1136px;margin:0 auto}.cc-partner-list-title{display:flex;justify-content:space-between;gap:12px;align-items:center}.cc-partner-list-title button{padding:9px 12px}.cc-partner-table-wrap{overflow:auto}.cc-partner-list table{width:100%;border-collapse:collapse}.cc-partner-list th,.cc-partner-list td{text-align:left;padding:13px 10px;border-bottom:1px solid rgba(100,116,139,.18);white-space:nowrap}.cc-partner-list th{font-size:12px;text-transform:uppercase;color:#64748b}@media(max-width:760px){.cc-partner-header{display:grid}.cc-partner-grid{grid-template-columns:1fr}.cc-partner-header a{justify-self:start}.cc-partner-card{padding:18px;border-radius:18px}}
      `}</style>
    </main>
  );
}
